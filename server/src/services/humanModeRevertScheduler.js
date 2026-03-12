/**
 * Auto-revert mode HUMAN ke BOT setelah 5 jam (human_since).
 * Berjalan setiap 10 menit.
 */
import { Op } from "sequelize";
import { ChatSession } from "../models/index.js";
import logger from "../utils/logger.js";

const INTERVAL_MS = 10 * 60 * 1000; // 10 menit
const HUMAN_MAX_MS = 5 * 60 * 60 * 1000; // 5 jam

let intervalId = null;

export function startHumanModeRevertScheduler() {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - HUMAN_MAX_MS);
      const [count] = await ChatSession.update(
        { mode: "BOT", human_since: null, is_paused_until: null },
        {
          where: {
            mode: "HUMAN",
            human_since: { [Op.lt]: cutoff },
          },
        }
      );
      if (count > 0) {
        logger.info(`HumanModeRevert: ${count} sesi dikembalikan ke mode BOT (setelah 5 jam).`);
      }
    } catch (err) {
      logger.error(`HumanModeRevert scheduler error: ${err.message}`);
    }
  }, INTERVAL_MS);
  logger.info("HumanModeRevert scheduler started (setiap 10 menit, revert HUMAN setelah 5 jam).");
}

export function stopHumanModeRevertScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("HumanModeRevert scheduler stopped.");
  }
}
