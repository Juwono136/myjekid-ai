import { Op } from "sequelize";
import { User, Courier } from "../models/index.js";
import { handleUserMessage } from "../services/flows/userFlow.js";
import { handleCourierLocation, handleCourierMessage } from "../services/flows/courierFlow.js";

// Helper Sanitasi ID
const sanitizeId = (id) => {
  if (!id) return "";
  return id.split("@")[0];
};

export const handleIncomingMessage = async (req, res) => {
  try {
    const data = req.body;
    const io = req.io;

    if (!data || !data.from) return res.status(200).json({ status: "ignored" });

    // Parsing Identitas
    const rawSenderId = data.from;
    const senderIdClean = sanitizeId(rawSenderId);
    const senderName = data.name || "Unknown";
    let messageBody = data.body || "";

    // --- 1. DETEKSI LOKASI (DEBUG VERSION) ---
    let isLocationMessage = false;
    let lat = null;
    let lng = null;

    // Cek Format 1: data.location (Biasanya pesan attachment lokasi)
    if (data.location) {
      lat = parseFloat(data.location.latitude);
      lng = parseFloat(data.location.longitude);
      isLocationMessage = true;
    }
    // Cek Format 2: data._data (Biasanya Live Location atau raw data WAHA)
    else if (
      data._data &&
      (data._data.type === "location" || data._data.type === "live_location")
    ) {
      lat = parseFloat(data._data.lat);
      lng = parseFloat(data._data.lng);
      isLocationMessage = true;
    }

    // --- LOGGING PENTING (Agar kita tahu apa yang terjadi) ---
    if (isLocationMessage) {
      console.log(`📍 DETEKSI LOKASI DARI WA: Lat=${lat}, Lng=${lng}`);
    } else {
      // Jika Anda mengirim lokasi tapi log ini tidak muncul sebagai "DETEKSI LOKASI",
      // berarti struktur JSON dari WAHA berbeda.
      // Uncomment baris di bawah untuk melihat raw data jika masih gagal:
      // console.log("🔍 RAW BODY:", JSON.stringify(data).substring(0, 200));
    }

    // PENTING: Jika ini lokasi ATAU body berisi kode gambar base64, kosongkan body text!
    if (isLocationMessage || messageBody.startsWith("/9j/")) {
      messageBody = "";
    }

    // Parsing Media
    let mediaUrl = null;
    if (data.media && data.media.url) {
      mediaUrl = data.media.url;
    } else if (typeof data.media === "string" && data.media.startsWith("http")) {
      mediaUrl = data.media;
    }

    // Handle Pesan Kosong
    if (!messageBody && !mediaUrl && !isLocationMessage) {
      return res.status(200).json({ status: "ignored_empty" });
    }

    // --- DATABASE LOOKUP ---
    let courierData = await Courier.findOne({
      where: {
        [Op.or]: [
          { phone: senderIdClean },
          { device_id: rawSenderId },
          { device_id: senderIdClean },
        ],
      },
    });

    if (courierData && courierData.device_id !== rawSenderId) {
      await courierData.update({ device_id: rawSenderId });
    }

    let userData = null;
    if (!courierData) {
      userData = await User.findOne({
        where: {
          [Op.or]: [{ phone: senderIdClean }, { device_id: rawSenderId }],
        },
      });
    }

    // Log Identitas
    if (courierData) console.log(`👤 COURIER DETECTED: ${courierData.name} (${senderIdClean})`);
    else if (!isLocationMessage) console.log(`📨 MSG FROM: ${senderIdClean}`);

    // --- HANDLING KHUSUS LOKASI KURIR ---
    // Syarat: Pengirim adalah Kurir, Flag Lokasi True, Lat & Lng valid (tidak null/NaN)
    if (courierData && isLocationMessage && !isNaN(lat) && !isNaN(lng)) {
      console.log(`🚀 UPDATING LOCATION FOR: ${courierData.name}...`);

      // Panggil fungsi update di courierFlow
      const updateSuccess = await handleCourierLocation(courierData, lat, lng, io);

      if (updateSuccess) {
        console.log("✅ LOCATION UPDATE SUCCESS");
      } else {
        console.log("❌ LOCATION UPDATE FAILED (Check courierFlow)");
      }

      return res.status(200).json({ status: "location_processed" });
    } else if (isLocationMessage && !courierData) {
      console.log("⚠️ LOKASI DITERIMA TAPI BUKAN KURIR TERDAFTAR.");
    }

    // --- ROUTING FLOW TEXT/MEDIA ---
    let responsePayload = {};

    if (courierData) {
      responsePayload = await handleCourierMessage(courierData, messageBody, mediaUrl, rawSenderId);
    } else {
      const upperMsg = messageBody.toString().toUpperCase().trim();
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
