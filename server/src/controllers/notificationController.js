import { Op } from "sequelize";
import { Notification, Admin } from "../models/index.js";
import { sendEmailNotification } from "../services/emailService.js";
import { getHandoffEmailTemplate } from "../utils/emailTemplates.js";
import logger from "../utils/logger.js";

// Get notifications
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

    const unreadCount = await Notification.count({ where: { is_read: false } });

    res.status(200).json({
      status: "success",
      data: {
        items: rows,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Mark as read
export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Notification.update({ is_read: true }, { where: { id } });
    res.status(200).json({ status: "success", message: "Marked as read" });
  } catch (error) {
    next(error);
  }
};

// Mark all as read
export const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.update({ is_read: true }, { where: { is_read: false } });
    res.status(200).json({ status: "success", message: "All marked as read" });
  } catch (error) {
    next(error);
  }
};

// create notification
export const createSystemNotification = async (
  io,
  { title, message, type, referenceId, actionUrl, extraData }
) => {
  try {
    const notif = await Notification.create({
      title,
      message,
      type,
      reference_id: referenceId,
      action_url: actionUrl,
    });

    // Socket Emit
    if (io) io.emit("new-notification", notif);

    // Kirim Email jika HUMAN_HANDOFF
    if (type === "HUMAN_HANDOFF") {
      const admins = await Admin.findAll({ attributes: ["email"] });
      const emailList = admins.map((a) => a.email).filter((e) => e);

      if (emailList.length > 0) {
        const htmlContent = getHandoffEmailTemplate({
          userName: extraData?.userName || "User",
          userPhone: referenceId,
          message: message,
          dashboardUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}${actionUrl}`,
        });

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
