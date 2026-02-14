import { Op } from "sequelize";
import { Order } from "../models/index.js";
import { dispatchService } from "./dispatchService.js";

const INTERVAL_MS = 60 * 1000; // 1 menit
const OFFER_TIMEOUT_MS = 3 * 60 * 1000; // 3 menit

let intervalId = null;

export function startDispatchScheduler() {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - OFFER_TIMEOUT_MS);
      const orders = await Order.findAll({
        where: {
          status: "LOOKING_FOR_DRIVER",
          last_offered_at: { [Op.ne]: null, [Op.lt]: cutoff },
          pickup_latitude: { [Op.ne]: null },
          pickup_longitude: { [Op.ne]: null },
        },
        attributes: ["order_id"],
      });
      for (const o of orders) {
        dispatchService.findDriverForOrder(o.order_id).catch((err) =>
          console.error(`Dispatch scheduler error for ${o.order_id}:`, err)
        );
      }
    } catch (err) {
      console.error("Dispatch scheduler error:", err);
    }
  }, INTERVAL_MS);
  console.log("📬 Dispatch scheduler started (setiap 1 menit, timeout 3 menit per kurir).");
}

export function stopDispatchScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
