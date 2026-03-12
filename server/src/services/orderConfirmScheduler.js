/**
 * Auto-confirm order: jika pelanggan tidak membalas dalam 1 menit setelah pesan konfirmasi
 * ("Apakah sudah dapat kami proses sekarang ?"), order otomatis diproses dan dicarikan kurir.
 * Sekaligus kirim notifikasi WhatsApp singkat ke pelanggan.
 */
import { redisClient } from "../config/redisClient.js";
import { Order, User } from "../models/index.js";
import { dispatchService } from "./dispatchService.js";
import { messageService } from "./messageService.js";

const REDIS_KEY = "order_confirm_waiting";
const INTERVAL_MS = 30 * 1000; // 30 detik
const AUTO_CONFIRM_AFTER_MS = 60 * 1000; // 1 menit

// Pesan singkat saat order dikonfirmasi (selaras dengan ORDER_CONFIRMED_SHORT di userFlow)
const AUTO_CONFIRM_REPLY =
  "Pesanan sudah kami terima dan sedang dicarikan kurir. Kurir akan menghubungi kakak langsung. Terima kasih! 🙏";

let intervalId = null;

export function startOrderConfirmScheduler() {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const cutoff = now - AUTO_CONFIRM_AFTER_MS;
      const expired = await redisClient.zRangeByScore(REDIS_KEY, 0, cutoff);

      for (const orderId of expired) {
        try {
          const order = await Order.findOne({
            where: { order_id: orderId, status: "PENDING_CONFIRMATION" },
            include: [{ model: User, as: "user", attributes: ["phone"] }],
          });
          if (!order) {
            await redisClient.zRem(REDIS_KEY, orderId);
            continue;
          }

          await order.update({ status: "LOOKING_FOR_DRIVER" });
          const user = order.user;
          if (user) {
            const lastChat =
              Array.isArray(order.chat_messages) && order.chat_messages.length > 0
                ? order.chat_messages[order.chat_messages.length - 1]
                : "";
            const addressSnippet =
              typeof lastChat === "string" ? lastChat.slice(0, 500) : (lastChat?.body ?? "").slice(0, 500);
            await user.update({
              last_order_date: new Date(),
            });
          }

          // Bersihkan penanda konfirmasi di Redis
          await redisClient.zRem(REDIS_KEY, orderId);
          const phone = order.user_phone || (user && user.phone);
          if (phone) {
            const redisKey = `session:${phone}:draft`;
            await redisClient.del(redisKey);

            if (String(phone).trim().startsWith("62")) {
              try {
                await messageService.sendMessage(phone, AUTO_CONFIRM_REPLY);
              } catch (sendErr) {
              console.error(
                  `OrderConfirmScheduler: gagal kirim WhatsApp auto-confirm ke ${phone}:`,
                  sendErr.message,
                );
              }
            }
          }

          // Jalankan dispatch untuk mencari kurir
          await dispatchService.findDriverForOrder(order.order_id);
          console.log(`✅ Auto-confirm order ${orderId} (1 menit tanpa respons).`);
        } catch (err) {
          console.error(`OrderConfirmScheduler error for ${orderId}:`, err.message);
          await redisClient.zRem(REDIS_KEY, orderId).catch(() => {});
        }
      }
    } catch (err) {
      console.error("OrderConfirmScheduler error:", err.message);
    }
  }, INTERVAL_MS);
  console.log("⏱️ Order auto-confirm scheduler started (1 menit tanpa respons).");
}

export function stopOrderConfirmScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
