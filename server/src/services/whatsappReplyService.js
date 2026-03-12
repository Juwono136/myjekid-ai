/**
 * Layanan pengiriman balasan WhatsApp ke WAHA.
 * Menerima objek response (action + data) dari webhook processor dan memanggil messageService.
 */
import { messageService } from "./messageService.js";
import { isBlockedPhone } from "../config/chatbotBlocklist.js";
import logger from "../utils/logger.js";

/**
 * Mengirim balasan ke WhatsApp berdasarkan objek response dari processIncomingMessage.
 * Tidak mengirim ke nomor yang ada di blocklist (operator/bot).
 * @param {object} response - { action: 'reply_text'|'reply_location'|'reply_image', data: { to, body?, latitude?, longitude?, ... } }
 * @returns {Promise<boolean>} true jika terkirim, false jika gagal atau tidak ada aksi
 */
export async function sendReply(response) {
  if (!response || !response.action || !response.data) return false;

  const { action, data } = response;
  const to = data.to;
  if (!to) {
    logger.warn("whatsappReplyService: missing data.to");
    return false;
  }

  if (isBlockedPhone(to)) {
    logger.info("whatsappReplyService: skip reply to blocklisted number");
    return false;
  }

  try {
    if (action === "reply_text") {
      if (data.body) return await messageService.sendMessage(to, data.body);
      return false;
    }
    if (action === "reply_location") {
      const lat = data.latitude ?? data.lat;
      const lng = data.longitude ?? data.lng;
      if (lat != null && lng != null) {
        return await messageService.sendLocation(
          to,
          lat,
          lng,
          data.title || data.reply || "Lokasi"
        );
      }
      return false;
    }
    if (action === "reply_image") {
      if (data.url) return await messageService.sendImage(to, data.url, data.caption || "");
      return false;
    }

    logger.warn(`whatsappReplyService: unknown action ${action}`);
    return false;
  } catch (err) {
    logger.error(`whatsappReplyService sendReply error: ${err.message}`);
    return false;
  }
}
