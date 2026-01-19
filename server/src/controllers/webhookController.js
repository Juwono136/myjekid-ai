import { Op } from "sequelize";
import { User, ChatSession } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import { handleCourierMessage } from "../services/flows/courierFlow.js"; // (Belum diubah, biarkan dulu)
import { sanitizePhoneNumber } from "../utils/formatter.js";
import { createSystemNotification } from "./notificationController.js";
import logger from "../utils/logger.js";

const sanitizeId = (id) => (id ? id.split("@")[0] : "");

export const handleIncomingMessage = async (req, res) => {
  try {
    const msg = req.body?.payload;
    if (!msg) return res.status(400).send("No payload");

    // 1. Identifikasi Pengirim
    const rawId = msg.key?.remoteJid || msg.from;
    const phone = sanitizePhoneNumber(sanitizeId(rawId));
    const userName = msg.pushName || "Customer";

    // Abaikan pesan dari status/grup
    if (rawId.includes("status") || rawId.includes("g.us")) {
      return res.status(200).send("Ignored");
    }

    // 2. Cek User / Courier
    // (Logic sederhana: Cek sesi kurir nanti di courierFlow, sekarang kita fokus routing dasar)
    // Di sini kita asumsikan semua non-kurir adalah User, atau routing ditangani di Flow masing-masing.

    // 3. Ekstrak Tipe Pesan (Text, Location, Image)
    const messageType = Object.keys(msg.message)[0];

    let textBody = "";
    let locationData = null;
    let imageData = null;

    // A. Handle Text
    if (messageType === "conversation") {
      textBody = msg.message.conversation;
    } else if (messageType === "extendedTextMessage") {
      textBody = msg.message.extendedTextMessage.text;
    }

    // B. Handle Location
    else if (messageType === "locationMessage") {
      const loc = msg.message.locationMessage;
      locationData = {
        latitude: loc.degreesLatitude,
        longitude: loc.degreesLongitude,
        address: loc.comment || "", // Kadang user kasih comment di lokasi
      };
      textBody = "[Shared Location]";
    }

    // C. Handle Image (Fokus Struk/Nota)
    else if (messageType === "imageMessage") {
      const imgMsg = msg.message.imageMessage;
      textBody = imgMsg.caption || "[Dikirim Gambar]";

      // Mengambil URL Gambar (Pastikan provider WA Anda menyediakan URL ini)
      // Jika pakai WAHA/Baileys tertentu, URL mungkin ada di `url` atau `directPath`
      // Disini kita asumsi req.body sudah diproses middleware download atau ada url publik
      const imageUrl = imgMsg.url || req.body.data?.imageUrl;

      if (imageUrl) {
        imageData = {
          url: imageUrl,
          caption: imgMsg.caption || "",
        };
      }
    }

    // 4. Routing ke Flow (User vs Courier)
    // Cek Session DB untuk menentukan dia User atau Kurir (Logic singkat)
    // Untuk sekarang kita tembak ke handleUserMessage dulu sesuai instruksi fokus User.
    // (Nanti Anda bisa tambahkan `if (isCourier) handleCourierMessage(...)`)

    const response = await handleUserMessage(
      phone,
      userName,
      textBody,
      rawId,
      locationData,
      imageData, // <-- Kirim data gambar
      req.io,
    );

    // 5. Kirim Balasan (Output JSON standard N8N / WA API)
    if (response) {
      // Jika response berupa object command (reply_text, dll)
      if (response.reply) {
        return res.json({
          action: "reply_text",
          data: { to: rawId, body: response.reply },
        });
      }
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook Error:", error);
    // Fail-safe response
    return res.status(500).send("Internal Server Error");
  }
};
