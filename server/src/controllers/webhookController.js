import { Op } from "sequelize";
import { User, Courier, ChatSession, TrainingData } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import { handleCourierMessage } from "../services/flows/courierFlow.js";
import { dispatchService } from "../services/dispatchService.js";
import { redisClient } from "../config/redisClient.js";
import { sanitizePhoneNumber } from "../utils/formatter.js";

/**
 * Pastikan chatId aman untuk balas chat (bukan Status/Story).
 * - @lid dan @c.us diteruskan apa adanya agar WAHA bisa kirim (LID wajib dipakai untuk pengirim @lid).
 * - Hanya blokir JID yang memang untuk Status/Broadcast/Newsletter.
 */
const toSafeChatId = (rawFrom) => {
  if (!rawFrom || typeof rawFrom !== "string") return null;
  const s = rawFrom.trim();
  if (/status@broadcast|@newsletter|@broadcast/i.test(s)) return null;
  if (s.toLowerCase() === "status@broadcast") return null;
  return s;
};
import { createSystemNotification } from "./notificationController.js";
import logger from "../utils/logger.js";

/** Extract JID part before @ and strip optional :N suffix (e.g. 628xxx:0 -> 628xxx) so phone matching works. */
const sanitizeId = (id) => {
  if (!id) return "";
  const beforeAt = id.split("@")[0] || "";
  return beforeAt.replace(/:[\d]+$/, "");
};

/** Memastikan nomor punya record di users (untuk FK chat_sessions). Buat user minimal jika belum ada. */
const ensureUserForPhone = async (phone, defaultName = "User") => {
  let user = await User.findOne({ where: { phone } });
  if (!user) {
    user = await User.create({ phone, name: defaultName });
  }
  return user;
};

const buildPhoneCandidates = (rawPhone) => {
  const candidates = new Set();
  if (!rawPhone) return [];

  const rawText = rawPhone.toString();
  const rawDigits = rawText.replace(/[^0-9]/g, "");
  if (rawDigits) {
    candidates.add(rawDigits);
    // Handle sender IDs with suffix (e.g., ":26") by extracting plausible phone
    const match = rawDigits.match(/(62\d{8,13}|0\d{8,12}|8\d{8,12})/);
    if (match?.[1]) candidates.add(match[1]);
    // If digits are longer than a phone number OR original contains non-digit, try all substrings 10-15 digits
    if (rawDigits.length > 15 || /[^0-9]/.test(rawText)) {
      for (let start = 0; start < rawDigits.length; start += 1) {
        for (let len = 10; len <= 15; len += 1) {
          const chunk = rawDigits.slice(start, start + len);
          if (chunk.length < 10 || chunk.length > 15) continue;
          if (/^(62|0|8)\d+$/.test(chunk)) {
            candidates.add(chunk);
            const normalizedChunk = sanitizePhoneNumber(chunk);
            if (normalizedChunk) candidates.add(normalizedChunk);
          }
        }
      }
    }
  }

  const normalized = sanitizePhoneNumber(rawPhone);
  if (normalized) {
    candidates.add(normalized);
    if (normalized.startsWith("62")) {
      candidates.add(`0${normalized.slice(2)}`);
    }
  }

  return Array.from(candidates);
};

// STANDARD N8N RESPONSE (TEXT) — to = rawFrom; dinormalisasi ke chatId private (@c.us) agar tidak pernah kirim ke Status/Story
const createN8nResponse = (rawFrom, body) => {
  const to = toSafeChatId(rawFrom);
  if (!to) return null;
  return { action: "reply_text", data: { to, body } };
};

// N8N RESPONSE (LOCATION)
const createN8nLocationResponse = (rawFrom, lat, long, address, reply) => {
  const to = toSafeChatId(rawFrom);
  if (!to) return null;
  return {
    action: "reply_location",
    data: {
      to,
      latitude: lat,
      longitude: long,
      address: address || "",
      title: "Lokasi",
      reply: reply || "",
    },
  };
};

// N8N RESPONSE (IMAGE)
const createN8nImageResponse = (rawFrom, url, caption) => {
  const to = toSafeChatId(rawFrom);
  if (!to) return null;
  return { action: "reply_image", data: { to, url, caption: caption || "" } };
};

/** Jika response n8n null (chatId tidak aman), kembalikan no_response_needed. */
const replyOrIgnore = (res, n8nPayload) => {
  if (n8nPayload) return res.json(n8nPayload);
  return res.status(200).json({ status: "no_response_needed" });
};

export const handleIncomingMessage = async (req, res) => {
  try {
    const data = req.body;

    // VALIDASI PAYLOAD
    const payload = data.payload || data;
    if (!payload || !payload.from) return res.status(200).json({ status: "ignored_empty" });
    if (payload.fromMe) return res.status(200).json({ status: "ignored_self" });

    // FILTER TIPE PESAN (SAFETY GATE)
    const messageType = payload._data?.type || payload.type || "chat";
    const allowedTypes = ["chat", "location", "image"];

    if (!allowedTypes.includes(messageType)) {
      console.log(`Ignored unsupported message type: ${messageType}`);
      return replyOrIgnore(
        res,
        createN8nResponse(
          payload.from,
          "🙏 Maaf, saya saat ini hanya menerima Pesan Teks, Lokasi, dan Foto yang berhubungan dengan order MyJek.",
        ),
      );
    }

    // PARSING DATA DASAR
    const rawSenderId = payload.from;
    const senderIdClean = sanitizeId(rawSenderId);
    const senderName = payload.pushname || payload._data?.notifyName || "Customer";

    // Deteksi Isi Pesan
    let messageBody = "";
    let locationData = null;
    let mediaData = null;

    if (messageType === "chat") {
      messageBody = payload.body || "";
    } else if (messageType === "location") {
      locationData = {
        latitude: payload.lat || payload._data?.lat,
        longitude: payload.lng || payload._data?.lng,
        address: payload.body || payload._data?.loc,
      };
      messageBody = "SHARE_LOCATION_EVENT";
    } else if (messageType === "image") {
      messageBody = payload.caption || "";
      const highResUrl =
        payload.media?.url || payload.mediaUrl || payload._data?.mediaUrl || payload.url;
      const thumbnailBase64 = payload.body || payload._data?.body;

      if (highResUrl) {
        mediaData = highResUrl;
      } else {
        mediaData = thumbnailBase64;
      }
    }

    const upperBody = messageBody.toUpperCase().trim();
    let n8nResponse = null;

    // Redis: ambil testMode + cache kurir dalam satu paralel (kurangi latency)
    const testModeKey = `test_mode:${senderIdClean}`;
    const courierCacheKey = `courier_device:${rawSenderId}`;
    const [testMode, cachedCourierId] = await Promise.all([
      redisClient.get(testModeKey),
      redisClient.get(courierCacheKey),
    ]);

    // LOGIN KURIR (BISA DIPANGGIL DI PRODUCTION / NON-TEST MODE)
    if (upperBody.startsWith("#LOGIN")) {
      const inputPhone = upperBody.replace("#LOGIN", "").trim();
      const cleanPhone = sanitizePhoneNumber(inputPhone);

      if (!cleanPhone) {
        return replyOrIgnore(
          res,
          createN8nResponse(
            rawSenderId,
            "Maaf kak, Format Login salah. Silahkan gunakan/ketik: #LOGIN <Nomor HP> (Contoh: #LOGIN 08912345678)",
          ),
        );
      }

      const courierCandidates = buildPhoneCandidates(cleanPhone);
      const courierCandidate = await Courier.findOne({
        where: { phone: { [Op.in]: courierCandidates } },
        attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
      });

      if (!courierCandidate) {
        return replyOrIgnore(
          res,
          createN8nResponse(
            rawSenderId,
            `Nomor ${inputPhone} tidak terdaftar sebagai kurir. Silahkan hubungi admin.`,
          ),
        );
      }

      const isDifferentDevice =
        courierCandidate.device_id && courierCandidate.device_id !== rawSenderId;
      const isCurrentlyOnline = courierCandidate.status && courierCandidate.status !== "OFFLINE";

      if (isDifferentDevice && isCurrentlyOnline) {
        return replyOrIgnore(
          res,
          createN8nResponse(
            rawSenderId,
            "Akun kurir ini sudah aktif di perangkat lain. Silahkan hubungi admin jika perlu ganti perangkat.",
          ),
        );
      }

      await courierCandidate.update({
        device_id: rawSenderId,
        status: "IDLE",
        is_active: true,
      });
      await redisClient.sAdd("online_couriers", String(courierCandidate.id));
      await redisClient.setEx(`courier_device:${rawSenderId}`, 300, courierCandidate.id);
      await redisClient.del(testModeKey);
      dispatchService.offerPendingOrdersToCourier(courierCandidate).catch((err) =>
        logger.error("offerPendingOrdersToCourier after #LOGIN:", err)
      );

      return replyOrIgnore(
        res,
        createN8nResponse(
          rawSenderId,
          `✅ LOGIN BERHASIL!\nHalo ${courierCandidate.name}, akun kamu sudah aktif nih. Silahkan ditunggu ordernya masuk yah 😃🙏`,
        ),
      );
    }

    // IDENTIFIKASI PERAN — cache kurir by device (cachedCourierId dari Redis paralel di atas)
    let courier = null;
    if (cachedCourierId) {
      courier = await Courier.findByPk(cachedCourierId, {
        attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
      });
    }
    if (!courier) {
      const senderPhoneCandidates = buildPhoneCandidates(senderIdClean);
      courier = await Courier.findOne({
        where: {
          [Op.or]: [
            { phone: { [Op.in]: senderPhoneCandidates } },
            { device_id: rawSenderId },
          ],
        },
        attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
      });
      if (!courier && rawSenderId?.includes("@lid")) {
        const rawNotifyName = (payload.pushname || payload._data?.notifyName || "").toString();
        const cleanedName = rawNotifyName
          .replace(/\(.*?\)/g, "")
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (cleanedName) {
          courier = await Courier.findOne({
            where: { name: { [Op.iLike]: cleanedName } },
            attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
          });
          if (!courier) {
            courier = await Courier.findOne({
              where: { name: { [Op.iLike]: `%${cleanedName}%` } },
              attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
            });
          }
        }
        if (courier && courier.device_id !== rawSenderId) {
          await courier.update({ device_id: rawSenderId });
        }
      }
      const wantsOnlineKeyword = /^(#?siap|#?online|online|aktif|kembali)$/i.test(
        messageBody.trim()
      );
      if (!courier && wantsOnlineKeyword) {
        const phoneCandidates = buildPhoneCandidates(senderIdClean);
        if (phoneCandidates.length) {
          courier = await Courier.findOne({
            where: { phone: { [Op.in]: phoneCandidates } },
            attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
          });
        }
      }
    }
    if (courier) {
      await redisClient.setEx(courierCacheKey, 300, courier.id); // 5 menit cache
    }

    const senderPhoneCandidates = buildPhoneCandidates(senderIdClean);
    let isActingAsCourier = false;
    if (testMode === "COURIER") {
      isActingAsCourier = true;
      if (!courier) {
        const testUser = await User.findOne({
          where: { device_id: rawSenderId },
          attributes: ["phone"],
        });
        if (testUser) {
          const testUserCandidates = buildPhoneCandidates(testUser.phone);
          courier = await Courier.findOne({
            where: { phone: { [Op.in]: testUserCandidates } },
            attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
          });
        }
      }
    } else if (testMode === "USER") {
      isActingAsCourier = false;
    } else if (courier) {
      isActingAsCourier = true;
    }

    // ROUTING FLOW
    if (isActingAsCourier) {
      // FLOW KURIR
      // Cek Mode Test
      if (upperBody === "#TEST USER") {
        await redisClient.set(testModeKey, "USER");
        return replyOrIgnore(res, createN8nResponse(rawSenderId, "🛠️ MODE TESTING: AKTIF SEBAGAI USER."));
      }
      if (upperBody === "#TEST KURIR") {
        await redisClient.set(testModeKey, "COURIER");
        return replyOrIgnore(
          res,
          createN8nResponse(rawSenderId, "🛠️ MODE TESTING: ANDA SUDAH DI MODE KURIR."),
        );
      }

      // Login Kurir
      if (upperBody.startsWith("#LOGIN")) {
        const inputPhone = upperBody.replace("#LOGIN", "").trim();
        const cleanPhone = sanitizePhoneNumber(inputPhone);
        if (!cleanPhone)
          return replyOrIgnore(
            res,
            createN8nResponse(
              rawSenderId,
              "Maaf kak, Format Login salah. Silahkan gunakan/ketik: #LOGIN <Nomor HP> (Contoh: #LOGIN 08912345678)",
            ),
          );
        const courierCandidate = await Courier.findOne({
          where: { phone: cleanPhone },
          attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
        });
        if (!courierCandidate)
          return replyOrIgnore(res, createN8nResponse(rawSenderId, `Nomor ${inputPhone} tidak terdaftar.`));

        await courierCandidate.update({ device_id: rawSenderId, status: "IDLE", is_active: true });
        await redisClient.sAdd("online_couriers", String(courierCandidate.id));
        await redisClient.setEx(`courier_device:${rawSenderId}`, 300, courierCandidate.id);
        await redisClient.del(testModeKey);
        dispatchService.offerPendingOrdersToCourier(courierCandidate).catch((err) =>
          logger.error("offerPendingOrdersToCourier after #LOGIN (flow kurir):", err)
        );

        return replyOrIgnore(
          res,
          createN8nResponse(
            rawSenderId,
            `✅ LOGIN BERHASIL!\nHalo ${courierCandidate.name}, akun kamu sudah aktif nih. Silahkan ditunggu ordernya masuk yah 😃🙏`,
          ),
        );
      }

      // ChatSession untuk Kurir (intervention / #HUMAN) — butuh user agar FK chat_sessions.phone → users.phone terpenuhi
      const courierPhoneNorm = sanitizePhoneNumber(courier.phone) || courier.phone;
      await ensureUserForPhone(courierPhoneNorm, courier.name || "Kurir");
      let courierSession = await ChatSession.findOne({
        where: { phone: courierPhoneNorm },
        attributes: ["phone", "mode", "is_paused_until", "last_interaction"],
      });
      if (!courierSession) {
        courierSession = await ChatSession.create({
          phone: courierPhoneNorm,
          mode: "BOT",
          last_interaction: new Date(),
        });
      }

      // #HUMAN: beralih ke mode human (tanpa batasan waktu)
      if (upperBody === "#HUMAN") {
        await courierSession.update({ mode: "HUMAN", is_paused_until: null, last_interaction: new Date() });
        await createSystemNotification(req.io, {
          title: "Kurir meminta Human Mode (#HUMAN)",
          message: `${courier.name || "Kurir"} (${courier.phone}) meminta beralih ke human mode. Silakan balas dari dashboard.`,
          type: "HUMAN_HANDOFF",
          referenceId: courier.phone,
          actionUrl: "/dashboard/chat",
          extraData: { userName: courier.name || "Kurir" },
        });
        return replyOrIgnore(
          res,
          createN8nResponse(
            rawSenderId,
            "Sip, percakapan sudah dialihkan ke tim kami. Admin akan segera membalas ya. Terima kasih! 🙏",
          ),
        );
      }

      // Mode HUMAN / Paused → bot diam, forward ke admin
      const isCourierHumanMode = courierSession.mode === "HUMAN";
      const courierPausedUntil = courierSession.is_paused_until;
      const isCourierPaused = courierPausedUntil && new Date(courierPausedUntil) > new Date();
      if (isCourierHumanMode || isCourierPaused) {
        await TrainingData.create({
          user_question: messageBody,
          admin_answer: null,
          category: "HUMAN_INTERVENTION",
          source: `WHATSAPP_COURIER_${courier.phone}`,
        });
        if (req.io) {
          req.io.emit("intervention-message", {
            phone: courier.phone,
            user_name: courier.name,
            text: messageBody,
            sender: "COURIER",
            timestamp: new Date(),
            mode: "HUMAN",
          });
        }
        return res.status(200).json({ status: "forwarded_to_admin" });
      }

      if (courierSession.is_paused_until && new Date(courierSession.is_paused_until) <= new Date()) {
        await courierSession.update({ is_paused_until: null, mode: "BOT" });
      }

      // Handle Pesan Kurir
      const courierReply = await handleCourierMessage(
        courier,
        messageBody,
        mediaData,
        rawSenderId,
        mediaData,
        locationData,
        req.io,
      );

      // Routing Response Kurir
      if (courierReply?.action === "trigger_n8n_image") {
        n8nResponse = createN8nImageResponse(
          rawSenderId,
          courierReply.data.url,
          courierReply.data.caption,
        );
      } else if (courierReply?.type === "location") {
        n8nResponse = createN8nLocationResponse(
          rawSenderId,
          courierReply.latitude,
          courierReply.longitude,
          courierReply.address,
          courierReply.reply,
        );
      } else if (courierReply?.reply) {
        n8nResponse = createN8nResponse(rawSenderId, courierReply.reply);
      }
    } else {
      // FLOW USER

      if (upperBody === "#TEST KURIR") {
        await redisClient.set(testModeKey, "COURIER");
        return replyOrIgnore(res, createN8nResponse(rawSenderId, "🛠️ MODE TESTING: KEMBALI SEBAGAI KURIR."));
      }

      // Identifikasi User & Registrasi (hanya kolom yang dipakai untuk routing + nama)
      let existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { phone: { [Op.in]: senderPhoneCandidates } },
            { device_id: rawSenderId },
          ],
        },
        attributes: ["phone", "name", "device_id"],
      });

      // Pelanggan baru: wajib kirim nomor HP dulu. Jika belum terdaftar dan pesan bukan nomor HP valid, langsung balas minta registrasi.
      if (!existingUser) {
        const phoneFromMessage = sanitizePhoneNumber(messageBody);
        if (!phoneFromMessage) {
          return replyOrIgnore(
            res,
            createN8nResponse(
              rawSenderId,
              `👋 Halo Kak! Selamat datang di MyJek, aplikasi pesan - antar online 😃.\n\nKarena ini pertama kali chat, mohon kirim nomor HP dulu ya.\nContohnya ketik: 08123456789`,
            ),
          );
        }
      }

      if (!existingUser && sanitizePhoneNumber(messageBody)) {
        const phoneInput = sanitizePhoneNumber(messageBody);
        existingUser = await User.findOne({
          where: { phone: phoneInput },
          attributes: ["phone", "name", "device_id"],
        });
        if (!existingUser) {
          await User.create({ name: senderName, phone: phoneInput, device_id: rawSenderId });
          n8nResponse = createN8nResponse(
            rawSenderId,
            `✅ Registrasi berhasil!\nSalam kenal Kak ${senderName}. Selamat datang di MyJek. Mau pesan apa hari ini? 😃🙏`,
          );
        } else {
          await existingUser.update({ device_id: rawSenderId });
          n8nResponse = createN8nResponse(
            rawSenderId,
            `✅ Akun terhubung kembali. Mau pesan apa hari ini kak? 😃🙏`,
          );
        }
      } else {
        if (existingUser) {
          // LOGIC INTERVENTION & HANDOFF

          // Ambil / Buat Sesi Chat (kolom minimal untuk cek mode & pause)
          let session = await ChatSession.findOne({
            where: { phone: existingUser.phone },
            attributes: ["phone", "mode", "is_paused_until", "last_interaction"],
          });
          if (!session) {
            session = await ChatSession.create({
              phone: existingUser.phone,
              mode: "BOT",
              last_interaction: new Date(),
            });
          }

          // #HUMAN: beralih ke mode human (tanpa batasan waktu)
          if (upperBody === "#HUMAN") {
            await session.update({ mode: "HUMAN", is_paused_until: null, last_interaction: new Date() });
            await createSystemNotification(req.io, {
              title: "Pelanggan meminta Human Mode (#HUMAN)",
              message: `${existingUser.name || "Pelanggan"} (${existingUser.phone}) meminta beralih ke human mode. Silakan balas dari dashboard.`,
              type: "HUMAN_HANDOFF",
              referenceId: existingUser.phone,
              actionUrl: "/dashboard/chat",
              extraData: { userName: existingUser.name || "Pelanggan" },
            });
            return replyOrIgnore(
              res,
              createN8nResponse(
                rawSenderId,
                "Sip kak, percakapan sudah dialihkan ke tim kami. Admin akan segera membalas pesan kakak ya. Terima kasih! 🙏",
              ),
            );
          }

          // Cek Kondisi "DIAM" (Human Mode atau Paused)
          const isHumanMode = session.mode === "HUMAN";
          const currentTime = new Date();
          const isPaused =
            session.is_paused_until && new Date(session.is_paused_until) > currentTime;

          if (isHumanMode || isPaused) {
            // MODE HUMAN / PAUSED -> BOT DIAM & FORWARD KE ADMIN
            // Simpan Log ke TrainingData
            await TrainingData.create({
              user_question: messageBody,
              admin_answer: null, // Belum dijawab
              category: "HUMAN_INTERVENTION",
              source: "WHATSAPP_USER",
            });

            // Emit Socket (Pesan User)
            if (req.io) {
              req.io.emit("intervention-message", {
                phone: existingUser.phone,
                user_name: existingUser.name,
                text: messageBody,
                sender: "USER",
                timestamp: new Date(),
                mode: "HUMAN", // Kirim status HUMAN
              });
            }

            // Stop Bot (Return response kosong agar Bot tidak membalas)
            return res.status(200).json({ status: "forwarded_to_admin" });
          }

          // MODE BOT (AI BEKERJA)
          // Cek apakah waktu pause sudah habis? Jika ya, bersihkan status di DB
          if (session.is_paused_until && new Date(session.is_paused_until) <= currentTime) {
            await session.update({ is_paused_until: null, mode: "BOT" });
          }

          // Jalankan AI Service
          const userReply = await handleUserMessage(
            existingUser.phone,
            existingUser.name,
            messageBody,
            rawSenderId,
            locationData,
            req.io,
          );

          // Emit Socket (Monitoring Dashboard)
          if (req.io) {
            // Pesan User
            req.io.emit("intervention-message", {
              phone: existingUser.phone,
              user_name: existingUser.name,
              text: messageBody,
              sender: "USER",
              timestamp: new Date(),
              mode: "BOT",
            });

            // Balasan Bot
            if (userReply?.reply) {
              req.io.emit("intervention-message", {
                phone: existingUser.phone,
                user_name: existingUser.name,
                text: userReply.reply,
                sender: "BOT",
                timestamp: new Date(),
                mode: "BOT",
              });
            }
          }

          // Format Response ke N8N
          if (userReply?.action === "handoff") {
            const pauseDuration = 30 * 60 * 1000;
            const pauseUntil = new Date(Date.now() + pauseDuration);
            await session.update({ mode: "HUMAN", is_paused_until: pauseUntil });

            await createSystemNotification(req.io, {
              title: "SYSTEM HANDOFF: Bot Dialihkan ke HUMAN",
              message: `Bot mengalami kendala pada percakapan user ${existingUser.phone}. Mode dialihkan ke HUMAN selama 30 menit.`,
              type: "HUMAN_HANDOFF",
              referenceId: existingUser.phone,
              actionUrl: `/dashboard/chat`,
              extraData: { userName: existingUser.name || "User" },
            });

            n8nResponse = createN8nResponse(rawSenderId, userReply.reply);
          } else if (userReply?.type === "location") {
            n8nResponse = createN8nLocationResponse(
              rawSenderId,
              userReply.latitude,
              userReply.longitude,
              userReply.address,
              userReply.reply || "",
            );
          } else if (userReply?.reply) {
            n8nResponse = createN8nResponse(rawSenderId, userReply.reply);
          } else if (userReply?.action) {
            n8nResponse = userReply;
          }
        } else {
          // User Belum Terdaftar
          n8nResponse = createN8nResponse(
            rawSenderId,
            `👋 Halo Kak! Selamat datang di MyJek, aplikasi pesan - antar online 😃. \n\nKarena ini pertama kali chat, mohon kirim nomor HP dulu ya.\nContohnya ketik: 08123456789`,
          );
        }
      }
    }

    if (n8nResponse) return res.json(n8nResponse);
    return res.status(200).json({ status: "no_response_needed" });
  } catch (error) {
    logger.error(`Error Processing Webhook: ${error.message}`);

    // AUTOMATIC HANDOFF SAAT ERROR
    try {
      // Identifikasi Nomor HP dari body request (bisa user atau kurir)
      const rawId = req.body?.payload?.from || req.body?.payload?.chatId || "";
      const phone = sanitizePhoneNumber(sanitizeId(rawId));

      if (phone) {
        // ChatSession butuh FK ke users: pastikan ada record users untuk nomor ini (buat minimal jika belum)
        const courierByPhone = await Courier.findOne({ where: { phone } });
        const displayName = courierByPhone?.name || "User";
        const user = await ensureUserForPhone(phone, displayName);

        let session = await ChatSession.findOne({ where: { phone } });
        if (!session) {
          session = await ChatSession.create({
            phone,
            mode: "BOT",
            last_interaction: new Date(),
          });
        }

        const pauseDuration = 30 * 60 * 1000;
        const pauseUntil = new Date(Date.now() + pauseDuration);
        await session.update({
          mode: "HUMAN",
          is_paused_until: pauseUntil,
        });

        await createSystemNotification(req.io, {
          title: "SYSTEM CRASH: Bot Gagal Memproses Pesan!",
          message: `Terjadi error kritis pada Bot: "${error.message}". Mode otomatis dialihkan ke HUMAN untuk ${displayName} (${phone}). Segera lakukan tindakan atau chat untuk dibantu!`,
          type: "HUMAN_HANDOFF",
          referenceId: phone,
          actionUrl: `/dashboard/chat`,
          extraData: { userName: user.name || displayName },
        });

        logger.info(`Emergency Handoff triggered for ${phone}`);
      }
    } catch (innerError) {
      console.error("Gagal menjalankan Safety Net:", innerError);
    }
    const rawId = req.body?.payload?.from || req.body?.payload?.chatId || "";
    if (rawId) {
      return replyOrIgnore(
        res,
        createN8nResponse(
          rawId,
          "Maaf kak, sistem kami sedang mengalami kendala. Percakapan ini kami alihkan ke admin (mode HUMAN) selama 30 menit ya. Mohon tunggu sebentar 🙏",
        ),
      );
    }
    return res.status(200).json({ status: "error", message: "Error handled gracefully" });
  }
};