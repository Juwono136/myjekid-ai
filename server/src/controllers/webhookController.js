import { User, Courier } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import { handleCourierMessage } from "../services/flows/courierFlow.js";
import { Op } from "sequelize";

// Helper Sanitasi ID
const sanitizeId = (id) => {
  if (!id) return "";
  // Ambil bagian depan sebelum @
  return id.split("@")[0];
};

export const handleIncomingMessage = async (req, res) => {
  try {
    const data = req.body;

    // Log untuk memastikan data masuk
    // console.log("📥 Raw Data:", JSON.stringify(data));

    if (!data || !data.from) return res.status(200).json({ status: "ignored" });

    // 1. Parsing Identitas
    const rawSenderId = data.from; // Contoh: "254386768994458@lid"
    const senderIdClean = sanitizeId(rawSenderId);
    const senderName = data.name || "Unknown";
    let messageBody = data.body || "";

    // 2. Parsing Media (SESUAI JSON ANDA)
    // JSON N8N mengirim object: { url: "http...", mimetype: "..." }
    let mediaUrl = null;

    if (data.media && data.media.url) {
      mediaUrl = data.media.url;
    } else if (typeof data.media === "string" && data.media.startsWith("http")) {
      // Jaga-jaga jika N8N mengirim string URL langsung
      mediaUrl = data.media;
    }

    // PENTING: Jika ada gambar tapi body kosong, isi text dummy
    // Ini yang mengatasi masalah bot diam atau menganggap chat kosong
    if (mediaUrl && (!messageBody || messageBody === "")) {
      messageBody = "[IMAGE_RECEIVED]";
      console.log(`📸 Gambar Diterima: ${mediaUrl}`);
    }

    // Jika pesan kosong dan tidak ada gambar, abaikan
    if (!messageBody && !mediaUrl) {
      return res.status(200).json({ status: "ignored_empty" });
    }

    console.log(`\n📨 INCOMING: ${senderIdClean} | Body: ${messageBody}`);

    // ============================================================
    // 3. DATABASE LOOKUP
    // ============================================================

    // A. Cek Kurir (Cari berdasarkan Phone ATAU Device ID)
    let courierData = await Courier.findOne({
      where: {
        [Op.or]: [
          { phone: senderIdClean }, // Jika ID nya 628...
          { device_id: rawSenderId }, // Jika ID nya 254...@lid (PENTING)
          { device_id: senderIdClean }, // Fallback ID tanpa @lid
        ],
      },
    });

    // Auto-Binding (Opsional): Update device_id jika kurir ditemukan via phone
    // Note: Ini hanya jalan jika "from" adalah nomor HP. Jika "from" @lid, logic ini skip.
    if (courierData && courierData.device_id !== rawSenderId) {
      // Kita update biar next time lebih cepat
      await courierData.update({ device_id: rawSenderId });
    }

    // B. Cek User (Jika bukan kurir)
    let userData = null;
    if (!courierData) {
      userData = await User.findOne({
        where: {
          [Op.or]: [{ phone: senderIdClean }, { device_id: rawSenderId }],
        },
      });
    }

    // Log status identifikasi
    if (courierData) console.log(`✅ USER: COURIER (${courierData.name})`);
    else if (userData) console.log(`✅ USER: CUSTOMER (${userData.name})`);
    else console.log(`❓ USER: UNKNOWN/GUEST (${rawSenderId})`);

    // ============================================================
    // 4. ROUTING FLOW
    // ============================================================

    let responsePayload = {};

    if (courierData) {
      // ---> FLOW KURIR
      // Kirim URL Media agar bisa diproses (upload ke MinIO dll)
      responsePayload = await handleCourierMessage(
        courierData,
        messageBody,
        mediaUrl, // <--- URL dikirim ke sini
        rawSenderId
      );
    } else {
      // ---> FLOW USER / TAMU
      const upperMsg = messageBody.toString().toUpperCase().trim();

      // Fitur Login Manual (Penyelamat jika ID @lid tidak dikenali)
      if (upperMsg.startsWith("#LOGIN")) {
        responsePayload = await handleCourierMessage(null, messageBody, null, rawSenderId);
      } else {
        responsePayload = await handleUserMessage(
          senderIdClean,
          senderName,
          messageBody,
          rawSenderId
        );
      }
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    return res.status(200).json({ error: error.message });
  }
};
