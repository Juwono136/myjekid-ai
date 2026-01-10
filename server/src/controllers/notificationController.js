import { Op } from "sequelize";
import { Notification, Admin } from "../models/index.js";
import { sendEmailNotification } from "../services/emailService.js";
import { getHandoffEmailTemplate } from "../utils/emailTemplates.js"; // Import Template Email
import logger from "../utils/logger.js";

// --- API: GET NOTIFICATIONS (Pagination & Search) ---
export const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = "", startDate, endDate } = req.query;
    const offset = (page - 1) * limit;
    const whereClause = {};

    if (search) whereClause.title = { [Op.iLike]: `%${search}%` };
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClause.created_at = { [Op.between]: [start, end] };
    }

    const { count, rows } = await Notification.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    // Hitung unread terpisah agar akurat
    const unreadCount = await Notification.count({ where: { is_read: false } });

    res.status(200).json({
      status: "success",
      data: {
        items: rows,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        unreadCount, // Penting untuk Badge Lonceng
      },
    });
  } catch (error) {
    next(error);
  }
};

// --- API: MARK SINGLE READ ---
export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Notification.update({ is_read: true }, { where: { id } });
    res.status(200).json({ status: "success", message: "Marked as read" });
  } catch (error) {
    next(error);
  }
};

// --- API: MARK ALL READ ---
export const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.update({ is_read: true }, { where: { is_read: false } });
    res.status(200).json({ status: "success", message: "All marked as read" });
  } catch (error) {
    next(error);
  }
};

// --- INTERNAL: CREATE SYSTEM NOTIFICATION (Dipanggil Webhook) ---
export const createSystemNotification = async (
  io,
  { title, message, type, referenceId, actionUrl, extraData }
) => {
  try {
    // 1. Simpan DB
    const notif = await Notification.create({
      title,
      message,
      type,
      reference_id: referenceId,
      action_url: actionUrl,
    });

    // 2. Socket Emit
    if (io) io.emit("new-notification", notif);

    // 3. Kirim Email jika HUMAN_HANDOFF
    if (type === "HUMAN_HANDOFF") {
      const admins = await Admin.findAll({ attributes: ["email"] });
      const emailList = admins.map((a) => a.email).filter((e) => e); // Filter null

      if (emailList.length > 0) {
        const htmlContent = getHandoffEmailTemplate({
          userName: extraData?.userName || "User",
          userPhone: referenceId,
          message: message,
          dashboardUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}${actionUrl}`,
        });
        // Send async (jangan await agar tidak block)
        sendEmailNotification(emailList, `🚨 [ALERT] ${title}`, htmlContent).catch((e) =>
          logger.error("Email fail:", e)
        );
      }
    }
    return notif;
  } catch (error) {
    logger.error(`Error create notification: ${error.message}`);
  }
};
