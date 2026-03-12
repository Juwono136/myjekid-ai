/**
 * Kurir mengambil order dengan mengirim short_code di chat.
 * Setelah berhasil: forward seluruh chat order ke WA kurir, notifikasi ke pelanggan.
 */
import { Op } from "sequelize";
import { Order, User, sequelize } from "../models/index.js";
import { orderService } from "./orderService.js";
import { messageService } from "./messageService.js";
import { aiService } from "./ai/AIService.js";
import logger from "../utils/logger.js";

/**
 * Cek apakah teks seperti short_code (4–8 alphanumeric, wajib ada huruf DAN angka).
 * Jika body mengandung newline (hasil merge debounce), ambil baris pertama saja.
 * Contoh MATCH: "AB12", "PSY8", "X7Z2"
 * Contoh TIDAK MATCH: "siap" (tidak ada digit), "68000" (tidak ada huruf), "siap\nPSY8" (multi-line)
 */
export function looksLikeShortCode(text) {
  if (!text || typeof text !== "string") return false;
  // Ambil baris pertama jika ada newline (merge dari debounce)
  const firstLine = text.split("\n")[0].trim();
  // Wajib 4–8 karakter alfanumerik, HARUS ada minimal 1 digit DAN minimal 1 huruf
  if (!/^[A-Za-z0-9]{4,8}$/.test(firstLine)) return false;
  return /\d/.test(firstLine) && /[A-Za-z]/.test(firstLine);
}

/**
 * Kurir ambil order by short_code: assign order, forward chat ke kurir, notif ke customer.
 * Pencarian short_code case-insensitive (NSWD = nswd).
 * @returns {Promise<{ success: boolean, response?: object }>}
 */
export async function handleCourierTakeByShortCode(courier, shortCodeRaw) {
  const code = shortCodeRaw.trim().split("\n")[0].trim();
  const codeLower = code.toLowerCase();
  const shortCodeMatch = sequelize.where(sequelize.fn("LOWER", sequelize.col("short_code")), codeLower);

  const order = await Order.findOne({
    where: { status: "LOOKING_FOR_DRIVER", [Op.and]: [shortCodeMatch] },
    include: [{ model: User, as: "user", attributes: ["phone", "name"] }],
  });

  if (!order) {
    const existing = await Order.findOne({
      where: shortCodeMatch,
      include: [{ model: User, as: "user", attributes: ["phone", "name"] }],
    });

    if (existing) {
      // Bandingkan sebagai string untuk menghindari isu type UUID vs string
      if (String(existing.courier_id) === String(courier.id)) {
        const statusHint =
          existing.status === "ON_PROCESS"
            ? "Sekarang kirim *foto struk/nota belanja* untuk proses tagihan ya kak. 🙏"
            : existing.status === "BILL_VALIDATION"
            ? "Total tagihan sudah siap. Balas *ok* untuk konfirmasi dan kirim ke pelanggan. 🙏"
            : existing.status === "BILL_SENT"
            ? "Tagihan sudah dikirim ke pelanggan. Ketik *#SELESAI* jika order sudah selesai. 🙏"
            : "Silakan lanjutkan proses order ini bersama pelanggan ya. 🙏";
        return {
          success: false,
          response: {
            action: "reply_text",
            data: {
              to: null,
              body: `Order *${existing.short_code}* sudah kamu ambil sebelumnya.\n\n${statusHint}`,
            },
          },
        };
      }

      if (existing.courier_id && String(existing.courier_id) !== String(courier.id)) {
        return {
          success: false,
          response: {
            action: "reply_text",
            data: {
              to: null,
              body: "Order ini sudah diambil oleh kurir lain. Silakan cek kode order yang lain ya. 🙏",
            },
          },
        };
      }
    }

    return {
      success: false,
      response: {
        action: "reply_text",
        data: {
          to: null,
          body: "Order tidak ditemukan atau sudah diambil kurir lain. Cek kode order ya.",
        },
      },
    };
  }

  const result = await orderService.takeOrder(order.order_id, courier.id);
  if (!result.success) {
    return {
      success: false,
      response: {
        action: "reply_text",
        data: { to: null, body: result.message || "Gagal mengambil order." },
      },
    };
  }

  const orderData = result.data;
  const userData = orderData.user;
  const custName = userData?.name || "Pelanggan";
  const custPhone = userData?.phone || orderData.user_phone;

  // Forward semua pesan chat pelanggan ke kurir (setiap pesan terpisah)
  const allChatMessages =
    Array.isArray(order.chat_messages) && order.chat_messages.length > 0
      ? order.chat_messages
      : orderData.raw_message
      ? [orderData.raw_message]
      : [];
  if (allChatMessages.length > 0) {
    await messageService.sendMessage(
      courier.phone,
      "📋 *Berikut forward pesan chat dari pelanggan saat order:*",
    ).catch((err) => logger.error("Failed to send chat header to courier:", err));
    for (const msg of allChatMessages) {
      const body = typeof msg === "string" ? msg : msg?.body ?? String(msg);
      if (body.trim()) {
        await messageService.sendMessage(courier.phone, body).catch((err) =>
          logger.error("Failed to forward one message to courier:", err),
        );
      }
    }
  }

  // Notifikasi ke pelanggan (kirim ke nomor HP pelanggan, bukan device_id)
  if (custPhone && String(custPhone).startsWith("62")) {
    try {
      const userAssignedReply = `✅ Pesanan kamu sudah diambil oleh kurir *${courier.name}* (${courier.phone}). Kurir akan segera menghubungi kamu. Terima kasih! 🙏`;
      await messageService.sendMessage(custPhone, userAssignedReply);
    } catch (err) {
      logger.error("Failed to notify customer on courier assign:", err);
    }
  }

  const displayPhone = custPhone && String(custPhone).startsWith("62") ? custPhone : "(nomor belum terdeteksi)";

  return {
    success: true,
    response: {
      action: "reply_text",
      data: {
        to: null,
        body:
          `✅ Order *${orderData.short_code}* berhasil kamu ambil.\n\n` +
          `👤 *Nama pelanggan:* ${custName}\n` +
          `📱 *Nomor HP pelanggan:* ${displayPhone}\n\n` +
          `Silakan chat/kontak langsung pelanggan untuk proses order. 🙏`,
      },
    },
  };
}
