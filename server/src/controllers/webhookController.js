import { Op } from "sequelize";
import { User, Courier, ChatSession, TrainingData } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import { handleCourierMessage } from "../services/flows/courierFlow.js";
import { redisClient } from "../config/redisClient.js";
import { sanitizePhoneNumber } from "../utils/formatter.js";
import { createSystemNotification } from "./notificationController.js";
import logger from "../utils/logger.js";

const sanitizeId = (id) => (id ? id.split("@")[0] : "");

// STANDARD N8N RESPONSE (TEXT)
const createN8nResponse = (to, body) => {
  return {
    action: "reply_text",
    data: { to: to, body: body },
  };
};

// N8N RESPONSE (LOCATION)
const createN8nLocationResponse = (to, lat, long, address, reply) => {
  return {
    action: "reply_location",
    data: {
      to: to,
      latitude: lat,
      longitude: long,
      address: address,
      title: "Lokasi",
      reply: reply || "",
    },
  };
};

// N8N RESPONSE (IMAGE)
const createN8nImageResponse = (to, url, caption) => {
  return {
    action: "reply_image",
    data: {
      to: to,
      url: url,
      caption: caption,
    },
  };
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
      return res
        .status(200)
        .json(
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

    //CEK MODE TESTING (REDIS)
    const testModeKey = `test_mode:${senderIdClean}`;
    const testMode = await redisClient.get(testModeKey); // "USER" atau "COURIER"

    // IDENTIFIKASI PERAN
    let courier = await Courier.findOne({
      where: {
        [Op.or]: [{ phone: senderIdClean }, { device_id: rawSenderId }],
      },
    });

    let isActingAsCourier = false;
    if (courier) {
      if (testMode === "USER") isActingAsCourier = false;
      else isActingAsCourier = true;
    } else {
      if (testMode === "COURIER") isActingAsCourier = true;
    }

    // ROUTING FLOW
    if (isActingAsCourier) {
      // FLOW KURIR
      // Cek Mode Test
      if (upperBody === "#TEST USER") {
        await redisClient.set(testModeKey, "USER");
        return res.json(createN8nResponse(rawSenderId, "🛠️ MODE TESTING: AKTIF SEBAGAI USER."));
      }
      if (upperBody === "#TEST KURIR") {
        await redisClient.set(testModeKey, "COURIER");
        return res.json(
          createN8nResponse(rawSenderId, "🛠️ MODE TESTING: ANDA SUDAH DI MODE KURIR."),
        );
      }

      // Login Kurir
      if (upperBody.startsWith("#LOGIN")) {
        const inputPhone = upperBody.replace("#LOGIN", "").trim();
        const cleanPhone = sanitizePhoneNumber(inputPhone);
        if (!cleanPhone)
          return res.json(
            createN8nResponse(
              rawSenderId,
              "Maaf kak, Format Login salah. Silahkan gunakan/ketik: #LOGIN <Nomor HP> (Contoh: #LOGIN 08912345678)",
            ),
          );
        const courierCandidate = await Courier.findOne({ where: { phone: cleanPhone } });
        if (!courierCandidate)
          return res.json(createN8nResponse(rawSenderId, `Nomor ${inputPhone} tidak terdaftar.`));

        await courierCandidate.update({ device_id: rawSenderId, status: "IDLE", is_active: true });
        await redisClient.sAdd("online_couriers", String(courierCandidate.id));
        await redisClient.del(testModeKey);

        return res.json(
          createN8nResponse(
            rawSenderId,
            `✅ LOGIN BERHASIL!\nHalo ${courierCandidate.name}, akun kamu sudah aktif nih. Silahkan ditunggu ordernya masuk yah 😃🙏`,
          ),
        );
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
          courierReply.data.to,
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
        return res.json(createN8nResponse(rawSenderId, "🛠️ MODE TESTING: KEMBALI SEBAGAI KURIR."));
      }

      // Identifikasi User & Registrasi
      let existingUser = await User.findOne({
        where: { [Op.or]: [{ phone: senderIdClean }, { device_id: rawSenderId }] },
      });

      if (!existingUser && sanitizePhoneNumber(messageBody)) {
        const phoneInput = sanitizePhoneNumber(messageBody);
        existingUser = await User.findOne({ where: { phone: phoneInput } });
        if (!existingUser) {
          await User.create({ name: senderName, phone: phoneInput, device_id: rawSenderId });
          n8nResponse = createN8nResponse(
            rawSenderId,
            `✅ REGISTRASI BERHASIL!\nSalam kenal Kak ${senderName}. Selamat datang di MyJekID - Aplikasi pesan antar melalui chat WA, Mau order atau pesan apa hari ini kak? 😃🙏`,
          );
        } else {
          await existingUser.update({ device_id: rawSenderId });
          n8nResponse = createN8nResponse(
            rawSenderId,
            `✅ Akun terhubung kembali. Mau order apa hari ini nih kak.. 😃🙏`,
          );
        }
      } else {
        if (existingUser) {
          // LOGIC INTERVENTION & HANDOFF

          // Ambil / Buat Sesi Chat
          let session = await ChatSession.findOne({ where: { phone: existingUser.phone } });
          if (!session) {
            session = await ChatSession.create({
              phone: existingUser.phone,
              user_name: existingUser.name,
              mode: "BOT",
              last_interaction: new Date(),
            });
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
          if (userReply?.reply) n8nResponse = createN8nResponse(rawSenderId, userReply.reply);
          else if (userReply?.action) n8nResponse = userReply;
        } else {
          // User Belum Terdaftar
          n8nResponse = createN8nResponse(
            rawSenderId,
            `👋 Halo Kak! Mohon verifikasi nomor HP dulu yah sebelum lanjut order. Ketik: <No_HP> (Contoh: 08123456789).`,
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
      // Identifikasi Nomor HP User dari body request (karena variabel existingUser mungkin undefined jika error di awal)
      const rawId = req.body?.payload?.from || req.body?.payload?.chatId || "";
      const phone = sanitizePhoneNumber(sanitizeId(rawId));

      if (phone) {
        // Update Mode ke HUMAN di Database
        // Kita cari atau buat sesi darurat jika belum ada
        let session = await ChatSession.findOne({ where: { phone } });

        // Hanya lakukan handoff jika mode saat ini masih BOT
        if (session && session.mode === "BOT") {
          await session.update({
            mode: "HUMAN",
            is_paused_until: null, // Reset pause agar admin bisa langsung masuk
          });

          // Kirim Notifikasi & Email ke Admin
          await createSystemNotification(req.io, {
            title: "SYSTEM CRASH: Bot Gagal Memproses Pesan!",
            message: `Terjadi error kritis pada Bot: "${error.message}". Mode otomatis dialihkan ke HUMAN untuk user ${phone}. Segera lakukan tindakan atau chat user tersebut untuk dibantu!`,
            type: "HUMAN_HANDOFF",
            referenceId: phone,
            actionUrl: `/dashboard/chat`,
            extraData: { userName: session.user_name || "User" },
          });

          logger.info(`Emergency Handoff triggered for ${phone}`);
        }
      }
    } catch (innerError) {
      console.error("Gagal menjalankan Safety Net:", innerError);
    }
    return res.status(200).json({ status: "error", message: "Error handled gracefully" });
  }
};
