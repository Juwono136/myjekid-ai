import { Op } from "sequelize";
import { User, ChatSession } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import { handleCourierMessage } from "../services/flows/courierFlow.js";
import { sanitizePhoneNumber } from "../utils/formatter.js";
import { createSystemNotification } from "./notificationController.js";
import logger from "../utils/logger.js";

const sanitizeId = (id) => (id ? id.split("@")[0] : "");

export const handleIncomingMessage = async (req, res) => {
  try {
    const msg = req.body?.payload;

    // 1. Validasi Payload Dasar
    if (!msg) return res.status(400).send("No payload");

    // [FIX UTAMA]: Cek apakah properti .message ada?
    // Banyak event WA (seperti status delivered/read) tidak punya .message
    if (!msg.message) {
      // Kita abaikan saja event non-pesan ini agar tidak error
      return res.status(200).send("Ignored (No Message Body)");
    }

    // 2. Identifikasi Pengirim
    const rawId = msg.key?.remoteJid || msg.from;

    // Abaikan pesan dari status story (biasanya ada @status) atau grup (g.us)
    // Kecuali Anda memang ingin handle grup nanti.
    if (!rawId || rawId.includes("status") || rawId.includes("g.us")) {
      return res.status(200).send("Ignored Status/Group");
    }

    const phone = sanitizePhoneNumber(sanitizeId(rawId));
    const userName = msg.pushName || "Customer";

    // 3. Ekstrak Tipe Pesan (Text, Location, Image)
    // Sekarang aman karena kita sudah cek msg.message di atas
    const messageType = Object.keys(msg.message)[0];

    let textBody = "";
    let locationData = null;
    let imageData = null;

    // A. Handle Text (Conversation = pesan biasa, extendedTextMessage = reply/link)
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
        address: loc.comment || "",
      };
      textBody = "[Shared Location]";
    }

    // C. Handle Image
    else if (messageType === "imageMessage") {
      const imgMsg = msg.message.imageMessage;
      textBody = imgMsg.caption || "[Dikirim Gambar]";

      // Mengambil URL Gambar
      // Pastikan WAHA/Provider mengirim url. Jika tidak, butuh logic download media khusus.
      const imageUrl = imgMsg.url || req.body.data?.imageUrl || msg.url;

      if (imageUrl) {
        imageData = {
          url: imageUrl,
          caption: imgMsg.caption || "",
        };
      }
    } else {
      // Tipe pesan lain yang belum dihandle (Sticker, Audio, Contact, dll)
      // Kita anggap text kosong agar tidak crash, atau return ignored.
      console.log(`⚠️ Tipe pesan belum didukung: ${messageType}`);
      return res.status(200).send("Ignored Unsupported Message Type");
    }

    // 4. Routing ke Flow
    // Panggil User Flow
    const response = await handleUserMessage(
      phone,
      userName,
      textBody,
      rawId,
      locationData,
      imageData,
      req.io,
    );

    // 5. Kirim Balasan (Output JSON standard)
    if (response && response.reply) {
      return res.json({
        action: "reply_text",
        data: { to: rawId, body: response.reply },
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook Error:", error);
    // Jangan biarkan server crash, return 500 tapi log errornya
    return res.status(500).send("Internal Server Error");
  }
};
