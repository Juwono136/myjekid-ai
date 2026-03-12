/**
 * Sinkronisasi status kurir dengan jam shift:
 * - IDLE → OFFLINE ketika di luar jam shift.
 * - OFFLINE → IDLE ketika masuk jam shift (kurir aktif, bukan SUSPEND).
 * Shift 1: 06:00–13:59, Shift 2: 14:00–21:59 (env: SHIFT_1_START/END, SHIFT_2_START/END).
 */
import { Courier } from "../models/index.js";
import { redisClient } from "../config/redisClient.js";

const INTERVAL_MS = 5 * 60 * 1000; // 5 menit

const SHIFT_1_START = Number(process.env.SHIFT_1_START) || 6;
const SHIFT_1_END = Number(process.env.SHIFT_1_END) || 14;
const SHIFT_2_START = Number(process.env.SHIFT_2_START) || 14;
const SHIFT_2_END = Number(process.env.SHIFT_2_END) || 22;

let intervalId = null;

function isInShift(hour, shiftCode) {
  if (shiftCode === 1) return hour >= SHIFT_1_START && hour < SHIFT_1_END;
  if (shiftCode === 2) return hour >= SHIFT_2_START && hour < SHIFT_2_END;
  return false;
}

export function startCourierShiftScheduler() {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      const hour = new Date().getHours();

      const idleCouriers = await Courier.findAll({
        where: { status: "IDLE", is_active: true },
        attributes: ["id", "shift_code"],
      });
      for (const c of idleCouriers) {
        if (!isInShift(hour, c.shift_code)) {
          await c.update({ status: "OFFLINE" });
          await redisClient.sRem("online_couriers", String(c.id));
        }
      }

      const offlineCouriers = await Courier.findAll({
        where: { status: "OFFLINE", is_active: true },
        attributes: ["id", "shift_code"],
      });
      for (const c of offlineCouriers) {
        if (isInShift(hour, c.shift_code)) {
          await c.update({ status: "IDLE" });
          await redisClient.sAdd("online_couriers", String(c.id));
        }
      }
    } catch (err) {
      console.error("Courier shift scheduler error:", err);
    }
  }, INTERVAL_MS);
  console.log("🕐 Courier shift scheduler started (IDLE↔OFFLINE by shift).");
}

export function stopCourierShiftScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
