import { runAutoCancelStaleOrders } from "./autoCancelOrderService.js";

const INTERVAL_MS = 30 * 60 * 1000; // 30 menit

let intervalId = null;

export function startAutoCancelScheduler() {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      await runAutoCancelStaleOrders();
    } catch (err) {
      console.error("Auto-cancel scheduler error:", err);
    }
  }, INTERVAL_MS);
  console.log("⏰ Auto-cancel scheduler started (setiap 30 menit, batas 20 jam).");
}

export function stopAutoCancelScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
