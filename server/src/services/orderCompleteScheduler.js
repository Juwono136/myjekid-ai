/**
 * Auto-complete order: 1 jam setelah BILL_SENT tanpa #SELESAI dari kurir,
 * order dianggap selesai dan kurir kembali IDLE.
 */
import { Op } from "sequelize";
import { Order, Courier } from "../models/index.js";
import { orderService } from "./orderService.js";
import { messageService } from "./messageService.js";

const BILL_SENT_AUTO_COMPLETE_HOURS = 1;

export async function runOrderCompleteStale() {
  const cutoff = new Date(Date.now() - BILL_SENT_AUTO_COMPLETE_HOURS * 60 * 60 * 1000);
  const stale = await Order.findAll({
    where: {
      status: "BILL_SENT",
      updated_at: { [Op.lt]: cutoff },
    },
    attributes: ["order_id", "courier_id", "user_phone"],
    limit: 50,
  });

  for (const order of stale) {
    try {
      if (!order.courier_id) continue;
      const ok = await orderService.completeOrder(order.order_id, order.courier_id);
      if (ok) {
        const courier = await Courier.findByPk(order.courier_id, { attributes: ["phone"] });
        const msg =
          "Order otomatis diselesaikan (1 jam setelah tagihan dikirim). Status kamu sekarang IDLE, siap order berikutnya.";
        if (courier?.phone) {
          await messageService.sendMessage(courier.phone, msg).catch(() => {});
        }
        if (order.user_phone) {
          await messageService
            .sendMessage(
              order.user_phone,
              "Orderan sudah kami catat selesai. Terima kasih sudah menggunakan MyJek 💛"
            )
            .catch(() => {});
        }
        console.log(`Auto-complete order ${order.order_id} (1h after BILL_SENT).`);
      }
    } catch (err) {
      console.error(`OrderCompleteScheduler error ${order.order_id}:`, err.message);
    }
  }
}

const INTERVAL_MS = 10 * 60 * 1000; // 10 menit
let intervalId = null;

export function startOrderCompleteScheduler() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    runOrderCompleteStale().catch((err) => console.error("OrderCompleteScheduler:", err));
  }, INTERVAL_MS);
  console.log("⏰ Order complete scheduler started (1h after BILL_SENT).");
}

export function stopOrderCompleteScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
