import { Op } from "sequelize";
import { User, Courier, ChatSession, TrainingData, Order } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import {
  looksLikeShortCode,
  handleCourierTakeByShortCode,
} from "../services/courierTakeByShortCodeService.js";
import { redisClient } from "../config/redisClient.js";
import { sanitizePhoneNumber, extractCanonicalPhoneFromWaFrom } from "../utils/formatter.js";
import { enqueue, enqueuePresence } from "../services/messageQueueService.js";
import { getPhoneByLid } from "../services/messageService.js";
import { isBlockedPhone } from "../config/chatbotBlocklist.js";
import {
  handleCourierStrukImage,
  handleCourierConfirmBill,
  handleCourierReviseBill,
  handleCourierSelesai,
} from "../services/courierOrderFlowService.js";

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

// Response WhatsApp (format untuk whatsappReplyService / WAHA)
const createWaResponse = (rawFrom, body) => {
  const to = toSafeChatId(rawFrom);
  if (!to) return null;
  return { action: "reply_text", data: { to, body } };
};

/** Awalan pesan greeting pertama (tanpa footnote #HUMAN). */
const FIRST_MESSAGE_GREETING_PREFIX = "Hallo kak, Wa'alaykumsalam";
const HUMAN_HANDOFF_FOOTNOTE =
  "\n\n---\n💬 Jika terjadi kendala atau masalah, silahkan ketik #HUMAN jika ingin berbicara langsung dengan admin kami yah kak. 😅🙏";

/** Sisipkan info hand-off di setiap balasan kecuali greeting pertama. */
function appendHumanHandoffFootnote(body) {
  if (!body || typeof body !== "string") return body;
  const t = body.trimStart();
  if (t.startsWith(FIRST_MESSAGE_GREETING_PREFIX)) return body;
  if (body.includes("#HUMAN")) return body;
  return body + HUMAN_HANDOFF_FOOTNOTE;
}

const createWaLocationResponse = (rawFrom, lat, long, address, reply) => {
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

/**
 * Helper: ketika dipanggil dari queue (res = null) mengembalikan objek; jika dari HTTP mengirim response.
 * @param {object|null} res - res Express (null = panggilan dari queue)
 * @param {object|null} response - payload untuk reply (action + data)
 * @param {string} [status] - status bila tidak ada response (forwarded_to_admin, ignored_empty, dll.)
 */
const out = (res, response, status) => {
  if (!res) return status != null ? { status } : { response };
  if (response != null) return res.json(response);
  return res.status(200).json({ status: status || "no_response_needed" });
};

/**
 * Logika utama pemrosesan pesan WA. Bisa dipanggil dari HTTP (dengan res) atau dari queue (res = null).
 * @param {object} data - req.body (format WAHA: { payload: { from, body, ... } })
 * @param {object} io - Socket.IO instance
 * @param {object|null} res - Express res (null = return objek hasil untuk queue)
 */
export async function processIncomingMessage(data, io, res) {
  try {
    // VALIDASI PAYLOAD
    const payload = data.payload || data;
    if (!payload || !payload.from) return out(res, null, "ignored_empty");
    if (payload.fromMe) return out(res, null, "ignored_self");

    const fromForBlocklist =
      extractCanonicalPhoneFromWaFrom(payload.from) ||
      String(payload.from || "").replace(/:[\d]+$/, "").replace(/[^0-9]/g, "");
    if (fromForBlocklist && isBlockedPhone(fromForBlocklist)) {
      return out(res, null, "ignored_blocklist");
    }

    // FILTER TIPE PESAN (SAFETY GATE)
    const messageType = payload._data?.type || payload.type || "chat";
    const allowedTypes = ["chat", "location", "image", "audio", "ptt", "video", "document"];

    if (!allowedTypes.includes(messageType)) {
      console.log(`Ignored unsupported message type: ${messageType}`);
      return out(
        res,
        createWaResponse(
          payload.from,
          "🙏 Maaf, saya saat ini hanya menerima Pesan Teks, Lokasi, Foto, Voice Note, Video, dan Dokumen yang berhubungan dengan order MyJek.",
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
    } else if (messageType === "image" || messageType === "video" || messageType === "document") {
      messageBody = payload.caption || "";
      const highResUrl =
        payload.media?.url || payload.mediaUrl || payload._data?.mediaUrl || payload.url;
      const thumbnailBase64 = payload.body || payload._data?.body;

      if (highResUrl) {
        mediaData = highResUrl;
      } else {
        mediaData = thumbnailBase64;
      }
    } else if (messageType === "audio" || messageType === "ptt") {
      messageBody = "VOICE_NOTE_EVENT";
    }

    // Payload merged (batch) bisa punya lat/lng meski type chat — agar teks + lokasi tetap diproses
    if (
      (payload.lat != null || payload._data?.lat != null) &&
      (payload.lng != null || payload._data?.lng != null)
    ) {
      locationData = {
        latitude: payload.lat ?? payload._data?.lat,
        longitude: payload.lng ?? payload._data?.lng,
        address: payload._data?.loc || "",
      };
    }

    const upperBody = messageBody.toUpperCase().trim();
    let waResponse = null;

    const senderPhoneCandidates = buildPhoneCandidates(senderIdClean);
    let canonicalPhone = extractCanonicalPhoneFromWaFrom(rawSenderId);
    if (!canonicalPhone && rawSenderId && String(rawSenderId).includes("@lid")) {
      const resolved = await getPhoneByLid(rawSenderId);
      if (resolved) canonicalPhone = resolved;
    }
    const testModeEnabled =
      process.env.NODE_ENV !== "production" || process.env.ENABLE_WHATSAPP_TEST_MODE === "true";
    const testModeKey = `test_mode:${senderIdClean}`;
    const testMode = testModeEnabled ? await redisClient.get(testModeKey) : null;

    // Testing dengan 1 nomor (hanya non-production atau bila ENABLE_WHATSAPP_TEST_MODE=true)
    if (testModeEnabled && upperBody === "#TEST KURIR") {
      await redisClient.set(testModeKey, "COURIER", { EX: 86400 });
      return out(
        res,
        createWaResponse(
          rawSenderId,
          "🛠️ MODE TESTING: Anda sekarang bertindak sebagai KURIR. Ketik kode order untuk ambil order, atau #TEST USER untuk bertindak sebagai pelanggan.",
        ),
      );
    }
    if (testModeEnabled && upperBody === "#TEST USER") {
      await redisClient.set(testModeKey, "USER", { EX: 86400 });
      return out(
        res,
        createWaResponse(
          rawSenderId,
          "🛠️ MODE TESTING: Anda sekarang bertindak sebagai PELANGGAN. Ketik #TEST KURIR untuk bertindak sebagai kurir.",
        ),
      );
    }

    // Satu-satunya aksi kurir di chat: ambil order dengan ketik short_code (skip jika mode USER)
    if (looksLikeShortCode(messageBody) && testMode !== "USER") {
      // Selalu cari kurir by device_id dulu (agar 1 nomor @lid/@c.us match kurir yang sama), lalu by phone
      let courier = await Courier.findOne({
        where: {
          [Op.or]: [
            { device_id: rawSenderId },
            ...(senderPhoneCandidates.length
              ? [{ phone: { [Op.in]: senderPhoneCandidates } }]
              : []),
          ],
        },
        attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
      });

      if (courier) {
        await courier.update({ device_id: rawSenderId });
      } else if (testModeEnabled && testMode === "COURIER") {
        // Hanya daftarkan sebagai kurir jika punya nomor HP asli (62@c.us), bukan LID
        if (canonicalPhone) {
          courier = await Courier.findOne({
            where: { phone: canonicalPhone },
            attributes: ["id", "phone", "name", "device_id", "status", "is_active"],
          });
          if (courier) {
            await courier.update({ device_id: rawSenderId });
          } else {
            courier = await Courier.create({
              name: senderName || "Kurir Test",
              phone: canonicalPhone,
              shift_code: 1,
              status: "IDLE",
              is_active: true,
              device_id: rawSenderId,
            });
            await redisClient.sAdd("online_couriers", String(courier.id));
          }
        }
      }

      if (courier) {
        const takeResult = await handleCourierTakeByShortCode(courier, messageBody.trim());
        const resp = takeResult.response;
        if (resp?.data) resp.data.to = toSafeChatId(rawSenderId) || rawSenderId;
        return out(res, resp?.data?.to ? resp : null);
      }

      if (testModeEnabled && testMode === "COURIER") {
        return out(
          res,
          createWaResponse(
            rawSenderId,
            "Nomor ini belum terdaftar sebagai kurir. Tambahkan nomor HP Anda (format 62xxx) di dashboard Mitra Kurir, lalu gunakan nomor yang sama di WhatsApp untuk mengambil order.",
          ),
        );
      }
    }

    // Kurir dengan order aktif: struk (gambar), konfirmasi total (ok/ya), #SELESAI — cek SEBELUM pesan generik "mode kurir"
    const courierWithOrder = await Courier.findOne({
      where: {
        [Op.or]: [
          { device_id: rawSenderId },
          ...(senderPhoneCandidates.length ? [{ phone: { [Op.in]: senderPhoneCandidates } }] : []),
        ],
        current_order_id: { [Op.ne]: null },
      },
      attributes: ["id", "name", "phone", "current_order_id"],
    });
    if (courierWithOrder?.current_order_id) {
      const activeOrder = await Order.findOne({
        where: { order_id: courierWithOrder.current_order_id },
        include: [{ model: User, as: "user", attributes: ["phone", "name"] }],
      });
      if (activeOrder) {
        if (
          messageType === "image" &&
          ["ON_PROCESS", "BILL_VALIDATION"].includes(activeOrder.status)
        ) {
          const imageCount = payload._imageCount ?? (mediaData ? 1 : 0);
          if (imageCount > 1) {
            return out(
              res,
              createWaResponse(
                rawSenderId,
                "Mohon kirim *1 gambar struk saja* per order. Jika kamu mengirim lebih dari satu foto, silakan kirim ulang satu foto struk saja ya."
              )
            );
          }
          if (mediaData) {
            const replyText = await handleCourierStrukImage(courierWithOrder, activeOrder, mediaData);
            if (replyText) {
              return out(res, createWaResponse(rawSenderId, replyText));
            }
          }
        }
        if (messageType === "chat") {
          const lowerBody = (messageBody || "").toLowerCase().trim();
          const isConfirm =
            /^(ok|oke|ya|iya|sip|siap|y|yes|gas|lanjut|setuju|boleh)$/i.test(lowerBody) ||
            /^(ok|oke|ya|iya|sip|siap)(\s|,|\.|!)*$/i.test(lowerBody);
          if (activeOrder.status === "BILL_VALIDATION") {
            if (isConfirm) {
              const replyText = await handleCourierConfirmBill(courierWithOrder, activeOrder);
              if (replyText) {
                return out(res, createWaResponse(rawSenderId, replyText));
              }
            } else {
              const replyText = await handleCourierReviseBill(
                courierWithOrder,
                activeOrder,
                (messageBody || "").trim()
              );
              if (replyText) {
                return out(res, createWaResponse(rawSenderId, replyText));
              }
              return out(
                res,
                createWaResponse(
                  rawSenderId,
                  "Ketik *OK* atau *Ya* untuk konfirmasi total, atau ketik *angka* untuk revisi (contoh: 81000)."
                )
              );
            }
          }
          if (activeOrder.status === "BILL_SENT" && upperBody === "#SELESAI") {
            const replyText = await handleCourierSelesai(courierWithOrder, activeOrder);
            if (replyText) {
              return out(res, createWaResponse(rawSenderId, replyText));
            }
          }
        }
      }
    }

    // Mode kurir tapi pesan bukan short_code dan bukan aksi order (struk/ok/#SELESAI) → panduan
    if (testModeEnabled && testMode === "COURIER") {
      return out(
        res,
        createWaResponse(
          rawSenderId,
          "Anda dalam mode kurir. Ketik *kode order* (contoh: AB12) untuk ambil order, atau #TEST USER untuk bertindak sebagai pelanggan.",
        ),
      );
    }

    // Kurir kirim lokasi (Share Location WA) → update posisi & tampilkan di Live Map
    const hasLocation = locationData && locationData.latitude != null && locationData.longitude != null;
    if (hasLocation) {
      const courierByLocation = await Courier.findOne({
        where: {
          [Op.or]: [
            { phone: { [Op.in]: senderPhoneCandidates } },
            { device_id: rawSenderId },
          ],
        },
        attributes: ["id", "name", "phone", "current_latitude", "current_longitude", "status"],
      });
      if (courierByLocation) {
        const lat = parseFloat(locationData.latitude);
        const lng = parseFloat(locationData.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          await courierByLocation.update({
            current_latitude: lat,
            current_longitude: lng,
            last_active_at: new Date(),
          });
          if (io) {
            io.emit("courier-location-update", {
              id: courierByLocation.id,
              name: courierByLocation.name,
              phone: courierByLocation.phone,
              lat,
              lng,
              status: courierByLocation.status,
              updatedAt: new Date(),
            });
          }
          return out(
            res,
            createWaResponse(
              rawSenderId,
              "✅ Lokasi berhasil diperbarui. Posisi kamu sekarang terpantau di peta base camp.",
            ),
          );
        }
      }
    }

    // Pastikan kolom phone hanya berisi nomor HP (62@c.us). Cari by device_id dulu agar 1 orang (lid + c.us) satu record.
    let existingUser = await User.findOne({
      where: { device_id: rawSenderId },
      attributes: ["phone", "name", "device_id"],
    });
    if (!existingUser && canonicalPhone) {
      existingUser = await User.findOne({
        where: { phone: canonicalPhone },
        attributes: ["phone", "name", "device_id"],
      });
    }

    if (!existingUser) {
      if (!canonicalPhone) {
        return out(
          res,
          createWaResponse(
            rawSenderId,
            "Untuk mencatat pemesanan, nomor HP Anda harus terdeteksi. Pastikan menggunakan nomor WhatsApp dengan format 62xxx (contoh: 6281234567890). 🙏",
          ),
        );
      }
      existingUser = await User.create({
        phone: canonicalPhone,
        name: senderName || "Pelanggan",
        device_id: rawSenderId,
      });
    } else {
      const updates = { device_id: rawSenderId };
      if (canonicalPhone && existingUser.phone !== canonicalPhone) updates.phone = canonicalPhone;
      if (senderName && senderName !== existingUser.name) updates.name = senderName;
      await existingUser.update(updates);
    }

    const replyTo =
      existingUser && String(existingUser.phone || "").trim().startsWith("62")
        ? existingUser.phone
        : rawSenderId;

    {
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

          // #HUMAN: beralih ke mode human (tanpa batasan waktu; auto-revert setelah 5 jam)
          if (upperBody === "#HUMAN") {
            await session.update({ mode: "HUMAN", is_paused_until: null, last_interaction: new Date(), human_since: new Date() });
            await createSystemNotification(io, {
              title: "Pelanggan minta bantuan",
              message: `${existingUser.name || "Pelanggan"} (${existingUser.phone}) — silakan balas dari dashboard.`,
              type: "HUMAN_HANDOFF",
              referenceId: existingUser.phone,
              actionUrl: "/dashboard/chat",
              extraData: { userName: existingUser.name || "Pelanggan" },
            });
            return out(
              res,
              createWaResponse(
                replyTo,
                appendHumanHandoffFootnote(
                  "Sip kak, percakapan sudah dialihkan ke tim kami. Admin akan segera membalas pesan kakak ya. Terima kasih! 🙏",
                ),
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
          if (io) {
            io.emit("intervention-message", {
              phone: existingUser.phone,
              user_name: existingUser.name,
              text: messageBody,
              type: messageType,
              media_url: mediaData,
              latitude: locationData?.latitude,
              longitude: locationData?.longitude,
              sender: "USER",
              timestamp: new Date(),
              mode: "HUMAN", // Kirim status HUMAN
            });
          }

            // Stop Bot (Return response kosong agar Bot tidak membalas)
            return out(res, null, "forwarded_to_admin");
          }

          // MODE BOT (AI BEKERJA)
          // Cek apakah waktu pause sudah habis? Jika ya, bersihkan status di DB
          if (session.is_paused_until && new Date(session.is_paused_until) <= currentTime) {
            await session.update({ is_paused_until: null, mode: "BOT" });
          }

          // Jalankan AI Service (tanpa lokasi/koordinat)
          const orderChatBodies = payload._orderChatBodies || (messageBody ? [messageBody] : []);
          const userReply = await handleUserMessage(
            existingUser.phone,
            existingUser.name,
            messageBody,
            rawSenderId,
            null,
            io,
            { orderChatBodies },
          );

          // Emit Socket (Monitoring Dashboard)
          if (io) {
            // Pesan User
            io.emit("intervention-message", {
              phone: existingUser.phone,
              user_name: existingUser.name,
              text: messageBody,
              type: messageType,
              media_url: mediaData,
              latitude: locationData?.latitude,
              longitude: locationData?.longitude,
              sender: "USER",
              timestamp: new Date(),
              mode: "BOT",
            });

            // Balasan Bot
            if (userReply?.reply) {
              io.emit("intervention-message", {
                phone: existingUser.phone,
                user_name: existingUser.name,
                text: userReply.reply,
                type: "chat",
                sender: "BOT",
                timestamp: new Date(),
                mode: "BOT",
              });
            }
          }

          // Format response WhatsApp
          if (userReply?.action === "handoff") {
            const fiveHoursMs = 5 * 60 * 60 * 1000;
            const pauseUntil = new Date(Date.now() + fiveHoursMs);
            await session.update({ mode: "HUMAN", is_paused_until: pauseUntil, human_since: new Date() });

            await createSystemNotification(io, {
              title: "Bot dialihkan ke Human",
              message: `${existingUser.name || "Pelanggan"} (${existingUser.phone}) — silakan balas dari dashboard.`,
              type: "HUMAN_HANDOFF",
              referenceId: existingUser.phone,
              actionUrl: "/dashboard/chat",
              extraData: { userName: existingUser.name || "User" },
            });

            waResponse = createWaResponse(
              replyTo,
              appendHumanHandoffFootnote(userReply.reply),
            );
          } else if (userReply?.type === "location") {
            waResponse = createWaLocationResponse(
              replyTo,
              userReply.latitude,
              userReply.longitude,
              userReply.address,
              userReply.reply || "",
            );
          } else if (userReply?.reply) {
            waResponse = createWaResponse(
                replyTo,
                appendHumanHandoffFootnote(userReply.reply),
              );
          } else if (userReply?.action) {
            waResponse = userReply;
            if (waResponse?.data) waResponse.data.to = replyTo;
            if (waResponse?.data?.body) {
              waResponse.data.body = appendHumanHandoffFootnote(waResponse.data.body);
            }
          }
    }

    if (waResponse) return out(res, waResponse);
    return out(res, null, "no_response_needed");
  } catch (error) {
    logger.error(`Error Processing Webhook: ${error.message}`);

    // AUTOMATIC HANDOFF SAAT ERROR — pakai nomor HP kanonik (62xxx) untuk session & notifikasi
    const rawId = data?.payload?.from || data?.payload?.chatId || "";
    try {
      if (rawId) {
        let canonicalPhone = null;
        let existingUser = await User.findOne({
          where: { device_id: rawId },
          attributes: ["phone", "name", "device_id"],
        });
        if (existingUser && String(existingUser.phone || "").trim().startsWith("62")) {
          canonicalPhone = existingUser.phone;
        }
        if (!canonicalPhone) {
          canonicalPhone = await getPhoneByLid(rawId);
        }
        const fallbackPhone = sanitizePhoneNumber(sanitizeId(rawId));
        const phone = canonicalPhone || fallbackPhone;

        if (phone) {
          const courierByPhone = await Courier.findOne({ where: { phone } });
          const displayName = courierByPhone?.name || existingUser?.name || "User";
          const user = await ensureUserForPhone(phone, displayName);
          await user.update({ device_id: rawId }).catch(() => {});

          let session = await ChatSession.findOne({ where: { phone } });
          if (!session) {
            session = await ChatSession.create({
              phone,
              mode: "BOT",
              last_interaction: new Date(),
            });
          }

          const fiveHoursMs = 5 * 60 * 60 * 1000;
          const pauseUntil = new Date(Date.now() + fiveHoursMs);
          await session.update({
            mode: "HUMAN",
            is_paused_until: pauseUntil,
            human_since: new Date(),
          });

          await createSystemNotification(io, {
            title: "Bot bermasalah, mode Human",
            message: `${user.name || displayName} (${phone}) — silakan balas dari dashboard.`,
            type: "HUMAN_HANDOFF",
            referenceId: phone,
            actionUrl: "/dashboard/chat",
            extraData: { userName: user.name || displayName },
          });

          logger.info(`Emergency Handoff triggered for ${phone}`);
        }
      }
    } catch (innerError) {
      console.error("Gagal menjalankan Safety Net:", innerError);
    }
    if (rawId) {
      return out(
        res,
        createWaResponse(
          rawId,
          appendHumanHandoffFootnote(
            "Maaf kak, sistem kami sedang mengalami kendala. Percakapan ini kami alihkan ke admin (mode HUMAN) selama 5 jam ya. Mohon tunggu sebentar 🙏",
          ),
        ),
      );
    }
    return out(res, null, "error");
  }
}

/**
 * Handler HTTP webhook WAHA: enqueue pesan lalu return 200 (balasan dikirim oleh scheduler via WAHA).
 */
export async function handleIncomingMessage(req, res) {
  const data = req.body || {};
  const event = data.event;
  const payload = data.payload || data;
  const from = payload?.from || payload?.id;

  if (!from) {
    return res.status(200).json({ status: "ignored_empty" });
  }
  
  // Handle presence updates (typing status) — WAHA: payload.id = chatId, presences[].lastKnownPresence atau payload.presence
  if (event === "presence.update") {
    const chatId = payload?.id || payload?.from || from;
    const presences = payload?.presences || [];
    const contactPresence =
      presences.find((p) => p.participant && String(p.participant).includes("@c.us")) || presences[0];
    let lastKnown = (contactPresence?.lastKnownPresence ?? payload?.lastKnownPresence ?? payload?.presence ?? "").toString().toLowerCase();
    if (!lastKnown && presences.length > 0) lastKnown = (presences[0].lastKnownPresence ?? "").toString().toLowerCase();
    const isTyping = lastKnown === "typing" || lastKnown === "recording";
    await enqueuePresence(chatId, isTyping);
    logger.info(`presence.update chat=${chatId} lastKnownPresence=${lastKnown} isTyping=${isTyping}`);
    return res.status(200).json({ status: "presence_updated", isTyping });
  }

  if (payload.fromMe) {
    return res.status(200).json({ status: "ignored_self" });
  }

  const { ok, queued } = await enqueue(from, data);
  return res.status(200).json({ status: ok && queued ? "queued" : "error", queued: !!queued });
}