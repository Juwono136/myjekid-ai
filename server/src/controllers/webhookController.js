import { handleUserMessage } from "../services/flows/userFlow.js";
import { sanitizePhoneNumber } from "../utils/formatter.js";

const sanitizeId = (id) => (id ? id.split("@")[0] : "");

export const handleIncomingMessage = async (req, res) => {
  // Helper: Selalu balas JSON ke n8n, jangan pernah kirim text biasa!
  const replyN8n = (action, data = {}) => {
    console.log(`📤 Response to n8n: [${action}]`, JSON.stringify(data));
    return res.json({ action, data });
  };

  try {
    const msg = req.body?.payload || req.body;

    // 1. Cek Payload
    if (!msg) {
      console.log("⚠️ Payload kosong/undefined");
      return replyN8n("no_action", { reason: "Empty Payload" });
    }

    // 2. Cek apakah ini Pesan Chat (bukan status update/typing)
    // WAHA kadang mengirim event 'message_ack' atau 'presence'. Kita butuh 'message' atau 'type'.
    if (!msg.message && !msg.type && !msg.body) {
      console.log("⚠️ Event diabaikan (Bukan pesan chat content). Keys:", Object.keys(msg));
      return replyN8n("no_action", { reason: "Not a chat message" });
    }

    // 3. Identifikasi Pengirim
    const rawId = msg.key?.remoteJid || msg.from;
    const isFromMe = msg.key?.fromMe || msg.fromMe;

    // Filter: Jangan balas pesan sendiri
    if (isFromMe) {
      return replyN8n("no_action", { reason: "From Me" });
    }

    // Filter: Abaikan Status/Story
    if (!rawId || rawId.includes("status") || rawId.includes("g.us")) {
      return replyN8n("no_action", { reason: "Status/Group Message" });
    }

    const phone = sanitizePhoneNumber(sanitizeId(rawId));
    const userName = msg.pushName || "Customer";

    console.log(`========================================`);
    console.log(`📩 INCOMING MSG from ${userName} (${phone})`);

    // 4. Ekstrak Isi Pesan
    // Handle berbagai kemungkinan struktur JSON dari WAHA
    const messageContent = msg.message || {};
    const messageType = Object.keys(messageContent)[0] || "unknown";

    let textBody = "";
    let locationData = null;
    let imageData = null;

    if (messageType === "conversation") {
      textBody = messageContent.conversation;
    } else if (messageType === "extendedTextMessage") {
      textBody = messageContent.extendedTextMessage?.text;
    } else if (messageType === "imageMessage") {
      const img = messageContent.imageMessage;
      textBody = img.caption || "[Image]";
      const url = img.url || msg.data?.imageUrl || msg.url; // Cek berbagai field url
      if (url) imageData = { url, caption: textBody };
    } else if (messageType === "locationMessage") {
      const loc = messageContent.locationMessage;
      textBody = "[Location]";
      locationData = {
        latitude: loc.degreesLatitude,
        longitude: loc.degreesLongitude,
        address: loc.comment,
      };
    } else if (msg.body) {
      // Fallback jika struktur simple
      textBody = msg.body;
    }

    console.log(`💬 Type: ${messageType} | Content: "${textBody}"`);

    // 5. PANGGIL USER FLOW
    // Kita panggil logic utama
    const response = await handleUserMessage(
      phone,
      userName,
      textBody,
      rawId,
      locationData,
      imageData,
      req.io,
    );

    // 6. PROSES JAWABAN DARI FLOW
    if (!response) {
      // Jika userFlow return null (misal: Mode Human, atau Error), n8n harus tetap dapat JSON
      console.log("⚠️ Flow returned NULL (Mungkin mode HUMAN atau Error)");
      return replyN8n("no_action", { reason: "Flow Logic Skipped (Human Mode?)" });
    }

    if (response.reply) {
      // ✅ SUKSES: Kirim perintah reply_text ke n8n Action Router
      return replyN8n("reply_text", { to: rawId, body: response.reply });
    }

    // Default catch-all
    return replyN8n("no_action", { reason: "No reply generated" });
  } catch (error) {
    console.error("❌ CRITICAL ERROR webhookController:", error);
    // Jangan biarkan n8n timeout/error connection, kirim JSON error
    return replyN8n("error", { message: error.message });
  }
};
