/**
 * Antrian pesan WhatsApp per user.
 * - Utama: pakai fitur typing WAHA (presence.update). Jika user "typing" → bot menunggu; jika "paused" (selesai mengetik) → proses 1 detik kemudian.
 * - Pastikan webhook WAHA dikonfigurasi dengan events: ["messages.upsert", "presence.update"].
 * - Fallback: jika presence tidak pernah diterima, proses setelah CHAT_PRESENCE_FALLBACK_MS (default 45s) agar chat tetap terlayani.
 */
import { redisClient } from "../config/redisClient.js";
import { sendReply } from "./whatsappReplyService.js";
import { isBlockedPhone } from "../config/chatbotBlocklist.js";
import logger from "../utils/logger.js";

const REDIS_QUEUE_PREFIX = "wa:q:";
const REDIS_DEBOUNCE_SET = "wa:debounce";
const REDIS_TYPING_PREFIX = "wa:typing:";
/** Jeda minimal sebelum proses (ms): memberi waktu WAHA kirim presence "paused". Tanpa ini bot bisa balas saat user masih ngetik. */
const MIN_WAIT_MS = Number(process.env.CHAT_MIN_WAIT_MS) || 5000;
/** Fallback jika presence tidak pernah diterima: proses setelah waktu ini (ms). */
const FALLBACK_MS = Number(process.env.CHAT_PRESENCE_FALLBACK_MS) || 8000;
const SCHEDULER_INTERVAL_MS = 1000;
/** Batas antrian per user agar tidak membengkak saat traffic tinggi. */
const MAX_QUEUE_SIZE = Number(process.env.WA_QUEUE_MAX_SIZE) || 100;
/** Jumlah user yang diproses per tick scheduler (throughput). */
const BATCH_SIZE_PER_TICK = Number(process.env.WA_QUEUE_BATCH_SIZE) || 50;
const CONCURRENCY = Number(process.env.WA_QUEUE_CONCURRENCY) || 10;

let schedulerTimer = null;

/**
 * Ambil key antrian untuk satu pengirim (dari WAHA: from bisa 628xxx@c.us atau xxx@lid).
 * @param {string} from - payload.from dari WAHA
 */
function queueKey(from) {
  if (!from || typeof from !== "string") return null;
  const safe = from.replace(/[^a-zA-Z0-9@._:-]/g, "_");
  return `${REDIS_QUEUE_PREFIX}${safe}`;
}

/**
 * Normalisasi "from" ke identifier kanonik per pengirim agar pesan paralel/berurutan
 * dari nomor yang sama (format @c.us) masuk antrian yang sama dan digabung.
 * Contoh: "628551000185@c.us" dan "628551000185:0@c.us" → sama "628551000185".
 * Untuk @lid tetap pakai nilai asli (pemanggil bisa resolve ke nomor lalu pass ke enqueue).
 */
export function getCanonicalQueueKey(from) {
  if (!from || typeof from !== "string") return from;
  const s = from.trim();
  if (!s.includes("@c.us")) return s;
  const beforeAt = s.split("@")[0] || "";
  const digits = beforeAt.replace(/:[\d]+$/, "").replace(/\D/g, "");
  if (digits.length < 10) return s;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

/**
 * Gabungkan beberapa payload WAHA menjadi satu payload virtual (satu "pesan" untuk AI).
 * - Teks digabung dengan newline.
 * - Lokasi: dipakai lokasi terakhir bila ada.
 * - Gambar: dipakai media terakhir bila ada.
 */
function mergePayloads(bodies) {
  if (!bodies || bodies.length === 0) return null;

  const first = bodies[0];
  const payload = first.payload || first;
  const texts = [];
  let lastLocation = null;
  let lastImage = null;
  let imageCount = 0;

  for (const body of bodies) {
    const p = body.payload || body;
    const type = p._data?.type || p.type || "chat";
    if (type === "chat" && p.body) texts.push(p.body);
    else if (type === "location") {
      lastLocation = {
        latitude: p.lat ?? p._data?.lat,
        longitude: p.lng ?? p._data?.lng,
        address: p.body || p._data?.loc,
      };
      texts.push("SHARE_LOCATION_EVENT");
    } else if (type === "image" || type === "video" || type === "document") {
      imageCount += type === "image" ? 1 : 0;
      lastImage = {
        url: p.media?.url || p.mediaUrl || p._data?.mediaUrl || p.url,
        caption: p.caption || p._data?.caption,
        body: p.body || p._data?.body,
      };
      if (p.caption) texts.push(p.caption);
    } else if (type === "audio" || type === "ptt") {
      texts.push("VOICE_NOTE_EVENT");
    }
  }

  const combinedBody = texts.join("\n").trim() || (first.payload || first).body || "";
  const mergedPayload = bodies.length === 1 ? { ...payload } : { ...payload };
  mergedPayload.body = combinedBody;
  mergedPayload._data = mergedPayload._data || {};
  mergedPayload._orderChatBodies = texts.length ? texts : (payload.body ? [payload.body] : []);

  const onlyLocation =
    lastLocation && (!combinedBody || combinedBody.trim() === "SHARE_LOCATION_EVENT");
  const onlyImage = lastImage && !lastLocation && !combinedBody;
  const primaryType = first.payload?.type || first.payload?._data?.type || (onlyLocation ? "location" : onlyImage ? "image" : "chat");
  mergedPayload._data.type = primaryType;
  mergedPayload.type = primaryType;

  if (lastLocation) {
    mergedPayload.lat = lastLocation.latitude;
    mergedPayload.lng = lastLocation.longitude;
    mergedPayload._data.lat = lastLocation.latitude;
    mergedPayload._data.lng = lastLocation.longitude;
    mergedPayload._data.loc = lastLocation.address;
  }
  if (lastImage) {
    mergedPayload.mediaUrl = lastImage.url;
    mergedPayload.url = lastImage.url;
    mergedPayload.caption = lastImage.caption;
    if (mergedPayload._data) {
      mergedPayload._data.mediaUrl = lastImage.url;
      mergedPayload._data.body = lastImage.body;
    }
  }
  mergedPayload._imageCount = imageCount;

  return { payload: mergedPayload };
}

/**
 * Enqueue satu pesan dari webhook WAHA. Webhook handler harus cepat return 200.
 * @param {string} from - payload.from (chatId pengirim)
 * @param {object} body - req.body dari WAHA (bisa { payload: {...} } atau { event, session, payload })
 * @returns {Promise<{ ok: boolean, queued: boolean }>}
 */
export async function enqueue(from, body) {
  const canonicalFrom = getCanonicalQueueKey(from);
  const key = queueKey(canonicalFrom);
  if (!key) return { ok: false, queued: false };

  try {
    const queueLen = await redisClient.rPush(key, JSON.stringify(body));
    if (queueLen > MAX_QUEUE_SIZE) {
      await redisClient.lTrim(key, -MAX_QUEUE_SIZE, -1);
      logger.warn(`messageQueue: queue capped for ${canonicalFrom}`);
    }
    
    // Tunggu minimal MIN_WAIT_MS agar ada waktu terima presence "paused". Jika user typing, perpanjang.
    const isTyping = await redisClient.get(`${REDIS_TYPING_PREFIX}${canonicalFrom}`);
    const delay = isTyping === "true" ? 20000 : Math.max(MIN_WAIT_MS, FALLBACK_MS);
    await redisClient.zAdd(REDIS_DEBOUNCE_SET, { score: Date.now() + delay, value: canonicalFrom });
    if (isTyping === "true") {
      logger.info(`messageQueue: Enqueued for ${canonicalFrom} while TYPING; will wait for paused.`);
    }
    
    return { ok: true, queued: true };
  } catch (err) {
    logger.error(`messageQueue enqueue error: ${err.message}`);
    return { ok: false, queued: false };
  }
}

/**
 * Update status typing dari WAHA presence.update event.
 */
export async function enqueuePresence(from, isTyping) {
  const canonicalFrom = getCanonicalQueueKey(from);
  if (!canonicalFrom) return;

  try {
    const typingKey = `${REDIS_TYPING_PREFIX}${canonicalFrom}`;
    if (isTyping) {
      // Set status typing, expired dalam 20 detik (jika WAHA gagal kirim stop typing)
      await redisClient.set(typingKey, "true", { EX: 20 });
      
      // Jika ada pesan di antrian, perpanjang waktu tunggunya karena user sedang mengetik lagi
      // Atau jika belum ada, set debounce awal agar jika pesan masuk dia punya waktu tunggu
      await redisClient.zAdd(REDIS_DEBOUNCE_SET, { score: Date.now() + 20000, value: canonicalFrom });
    } else {
      // User berhenti mengetik
      await redisClient.del(typingKey);
      
      // Jika ada pesan di antrian, segera proses (beri jeda 1 detik untuk memastikan pesan terakhir masuk)
      const score = await redisClient.zScore(REDIS_DEBOUNCE_SET, canonicalFrom);
      if (score !== null) {
        // Hanya majukan jadwal jika jadwal saat ini lebih lama dari 1 detik lagi
        if (score > Date.now() + 1000) {
          await redisClient.zAdd(REDIS_DEBOUNCE_SET, { score: Date.now() + 1000, value: canonicalFrom });
        }
      } else {
        // Cek apakah ada antrian
        const key = queueKey(canonicalFrom);
        const len = await redisClient.lLen(key);
        if (len > 0) {
          await redisClient.zAdd(REDIS_DEBOUNCE_SET, { score: Date.now() + 1000, value: canonicalFrom });
        }
      }
    }
  } catch (err) {
    logger.error(`messageQueue enqueuePresence error: ${err.message}`);
  }
}

/** Jeda (ms) untuk mengecek lagi antrian jika user masih dalam status typing. */
const TYPING_RECHECK_MS = 3000;

/**
 * Proses satu batch untuk satu pengirim: baca antrian, gabung payload, panggil processor, kirim balasan.
 * Jika user masih dalam status "typing" (dari WAHA presence.update), antrian tidak diproses dan dijadwal ulang.
 */
async function processOneQueue(from, processIncomingMessage, io) {
  const key = queueKey(from);
  if (!key) return;

  const isTyping = await redisClient.get(`${REDIS_TYPING_PREFIX}${from}`);
  if (isTyping === "true") {
    // Perpanjang waktu tunggu jika masih typing
    await redisClient.zAdd(REDIS_DEBOUNCE_SET, { score: Date.now() + TYPING_RECHECK_MS, value: from });
    logger.info(`messageQueue: processOneQueue deferred for ${from} because user is TYPING.`);
    return;
  }

  let rawMessages;
  try {
    rawMessages = await redisClient.lRange(key, 0, -1);
    if (!rawMessages || rawMessages.length === 0) {
      await redisClient.zRem(REDIS_DEBOUNCE_SET, from);
      return;
    }
    await redisClient.del(key);
    await redisClient.zRem(REDIS_DEBOUNCE_SET, from);
  } catch (err) {
    logger.error(`messageQueue processOneQueue redis error: ${err.message}`);
    return;
  }

  const bodies = rawMessages.map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (bodies.length === 0) return;

  const merged = mergePayloads(bodies);
  if (!merged) return;

  if (isBlockedPhone(merged.payload?.from)) {
    logger.info("messageQueue: skip processing blocklisted sender");
    return;
  }

  try {
    const result = await processIncomingMessage(merged, io, null);
    if (result?.response) await sendReply(result.response);
  } catch (err) {
    logger.error(`messageQueue processOneQueue handler error: ${err.message}`);
  }
}

/**
 * Menjalankan scheduler yang memproses antrian yang sudah lewat debounce.
 * @param {object} io - Socket.IO instance (untuk processIncomingMessage)
 * @param {function} processIncomingMessage - (data, io) => Promise<{ response?, status? }>
 */
export function startScheduler(io, processIncomingMessage) {
  if (schedulerTimer) return;

  const run = async () => {
    try {
      const now = Date.now();
      const ready = await redisClient.zRangeByScore(REDIS_DEBOUNCE_SET, 0, now, {
        LIMIT: { offset: 0, count: BATCH_SIZE_PER_TICK },
      });
      if (!ready || ready.length === 0) return;

      const chunks = [];
      for (let i = 0; i < ready.length; i += CONCURRENCY) {
        chunks.push(ready.slice(i, i + CONCURRENCY));
      }
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map((from) => processOneQueue(from, processIncomingMessage, io))
        );
      }
    } catch (err) {
      logger.error(`messageQueue scheduler error: ${err.message}`);
    }
  };

  schedulerTimer = setInterval(run, SCHEDULER_INTERVAL_MS);
  logger.info(
    "messageQueue: scheduler started (minWait=%d ms, fallback=%d ms, batch=%d concurrency=%d)",
    MIN_WAIT_MS,
    FALLBACK_MS,
    BATCH_SIZE_PER_TICK,
    CONCURRENCY
  );
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("messageQueue: scheduler stopped");
  }
}
