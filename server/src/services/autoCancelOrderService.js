import { Op } from "sequelize";
import { Order, User, Courier } from "../models/index.js";
import { aiService } from "./ai/AIService.js";
import { messageService } from "./messageService.js";
import { redisClient } from "../config/redisClient.js";

const AUTO_CANCEL_HOURS = 20;
const BATCH_SIZE = 100;

/**
 * Batalkan satu order (status -> CANCELLED), lepaskan kurir jika ada, kirim notif WA ke pelanggan.
 * Dipakai oleh auto-cancel dan admin cancel.
 */
export async function cancelOrderAndNotify(order, reason = "system") {
  if (!order || !order.order_id) return;
  if (order.status === "CANCELLED") return;

  const user = await User.findByPk(order.user_phone, { attributes: ["name", "phone"] });
  const customerPhone = order.user_phone || user?.phone;
  const userName = user?.name || "Pelanggan";

  await order.update({ status: "CANCELLED" });

  try {
    await redisClient.del(`session:${order.user_phone}:draft`);
  } catch (_) {}

  if (order.courier_id) {
    const courier = await Courier.findByPk(order.courier_id);
    if (courier) {
      await courier.update({
        status: "IDLE",
        current_order_id: null,
      });
    }
  }

  if (!customerPhone) return;
  try {
    const reply = await aiService.generateReply({
      role: "CUSTOMER",
      status: "ORDER_CANCELLED",
      context: {
        role: "CUSTOMER",
        user_name: userName,
        order_id: order.order_id,
        short_code: order.short_code || "",
        last_message: "",
      },
    });
    const text = typeof reply === "string" ? reply : reply?.reply;
    if (text) await messageService.sendMessage(customerPhone, text);
  } catch (err) {
    console.error(`Failed to send ORDER_CANCELLED to ${customerPhone}:`, err.message);
  }
}

/**
 * Cari order yang melewati batas waktu (20 jam) tanpa konfirmasi, batalkan batch, kirim notif.
 * Status: DRAFT, PENDING_CONFIRMATION, LOOKING_FOR_DRIVER.
 */
export async function runAutoCancelStaleOrders() {
  const cutoff = new Date(Date.now() - AUTO_CANCEL_HOURS * 60 * 60 * 1000);
  const stale = await Order.findAll({
    where: {
      status: { [Op.in]: ["DRAFT", "PENDING_CONFIRMATION", "LOOKING_FOR_DRIVER"] },
      created_at: { [Op.lt]: cutoff },
    },
    attributes: ["order_id", "user_phone", "short_code", "courier_id", "status"],
    limit: BATCH_SIZE,
  });

  for (const order of stale) {
    try {
      const fullOrder = await Order.findByPk(order.order_id);
      if (fullOrder && fullOrder.status !== "CANCELLED") {
        await cancelOrderAndNotify(fullOrder, "auto");
        console.log(`Auto-cancel: order ${order.order_id} (${order.status}, >${AUTO_CANCEL_HOURS}j).`);
      }
    } catch (err) {
      console.error(`Auto-cancel error for ${order.order_id}:`, err.message);
    }
  }
}
