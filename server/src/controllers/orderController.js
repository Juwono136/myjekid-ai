import { Courier, Order, User } from "../models/index.js";
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { sequelize } from "../config/database.js";
import { messageService } from "../services/messageService.js";
import { courierAssignedByAdmin, customerCourierAssignedByAdmin } from "../constants/messageTemplates.js";
import { orderService } from "../services/orderService.js";
import { dispatchService } from "../services/dispatchService.js";
import { redisClient } from "../config/redisClient.js";

const cancelOrderAndNotify = async (order, source = "admin") => {
  await order.update({ status: "CANCELLED" });
  await redisClient.zRem("order_confirm_waiting", order.order_id);
  await User.update({ order_id: null }, { where: { order_id: order.order_id } });
  const phone = order.user_phone;
  if (phone && String(phone).trim().startsWith("62")) {
    const msg = "Maaf kak, pesanan kakak telah dibatalkan oleh admin. Jika ada pertanyaan, silakan ketik #HUMAN untuk berbicara dengan admin. 🙏";
    await messageService.sendMessage(phone, msg).catch(() => {});
  }
};

const normalizeNotesList = (notes = []) =>
  Array.isArray(notes)
    ? notes
        .map((note) => (typeof note === "string" ? note : note?.note))
        .filter(Boolean)
    : [];

/** Pesan ramah untuk kirim link lokasi ke pelanggan (bukan hanya URL saja) */
const buildLocationLinkMessage = (userName, mapLink) =>
  `Kak ${userName || "pelanggan"}, berikut titik lokasi alamat antarnya ya. Bisa dibuka di Google Maps untuk panduan kurir:\n${mapLink}`;

/** Pesan ke pelanggan ketika order baru dibuat oleh admin (belum ada kurir). */
const buildOrderCreatedByAdminCustomerMessage = (order, user) => {
  const customerName = user?.name || "Pelanggan";
  const chatBlock =
    Array.isArray(order.chat_messages) && order.chat_messages.length > 0
      ? "\n\n📋 Pesan order:\n" + order.chat_messages.map((m) => (typeof m === "string" ? m : m?.body ?? "")).join("\n")
      : "";
  return (
    `Pesanan sudah kami catat kak ${customerName} 😊\n\n` +
    `🆔 Order ID: ${order.order_id} | Kode: ${order.short_code || "-"}\n` +
    chatBlock +
    `\n\nKami sedang carikan kurir. Silakan tunggu ya kak.\n\n` +
    `Catatan: jika ada komplain/masalah, ketik #HUMAN untuk beralih ke tim kami. 🙏`
  );
};

// Get all orders
export const getAllOrders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      sortBy = "created_at", // Default
      sortOrder = "DESC", // Default
    } = req.query;

    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * safeLimit;
    const whereClause = {};

    // Filter Status
    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    // Search Logic
    if (search) {
      whereClause[Op.or] = [
        { order_id: { [Op.iLike]: `%${search}%` } },
        { user_phone: { [Op.like]: `%${search}%` } },
      ];
    }

    // Sorting Logic
    const sortMap = {
      created_at: "created_at",
      total_amount: "total_amount",
      status: "status",
    };

    const dbSortField = sortMap[sortBy] || "created_at";
    const dbSortDirection = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await Order.findAndCountAll({
      where: whereClause,
      limit: safeLimit,
      offset,
      order: [[dbSortField, dbSortDirection]],
      distinct: true,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["name", "phone"],
        },
      ],
    });

    res.status(200).json({
      status: "success",
      data: rows,
      meta: {
        totalItems: count,
        totalPages: Math.ceil(count / safeLimit),
        currentPage: Math.max(1, parseInt(page, 10) || 1),
      },
    });
  } catch (error) {
    logger.error(`Error getAllOrders: ${error.message}`);
    next(error);
  }
};

// Get order detail
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      where: { order_id: id },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["name", "phone"],
        },
        {
          model: Courier,
          as: "courier",
          attributes: ["id", "name", "phone", "status"],
        },
      ],
    });

    if (!order) {
      return next(new AppError("Order tidak ditemukan", 404));
    }

    res.status(200).json({
      status: "success",
      data: order,
    });
  } catch (error) {
    logger.error(`Error getOrderById: ${error.message}`);
    next(error);
  }
};

// Update order detail (Admin/CS) — hanya chat_messages, total_amount, invoice_image_url, courier_id
export const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { chat_messages: chatMessagesBody, invoice_image_url: invoiceUrl, courier_id } = req.body;

    const order = await Order.findOne({ where: { order_id: id } });
    if (!order) {
      return next(new AppError("Order tidak ditemukan", 404));
    }

    const allowedStatuses = [
      "DRAFT",
      "PENDING_CONFIRMATION",
      "LOOKING_FOR_DRIVER",
      "ON_PROCESS",
      "BILL_VALIDATION",
    ];
    if (!allowedStatuses.includes(order.status)) {
      return next(new AppError("Order tidak bisa diupdate pada status ini.", 400));
    }

    const updates = {};

    if (Array.isArray(chatMessagesBody)) {
      updates.chat_messages = chatMessagesBody.map((m) => (typeof m === "string" ? m : m?.body ?? String(m)));
    }


    if (invoiceUrl !== undefined) {
      updates.invoice_image_url = invoiceUrl == null ? null : String(invoiceUrl);
    }

    if (courier_id) {
      const courier = await Courier.findByPk(courier_id);
      if (!courier) {
        return next(new AppError("Kurir tidak ditemukan.", 404));
      }
      if (courier.status !== "IDLE" || courier.is_active === false) {
        return next(new AppError("Kurir tidak dalam status IDLE/online.", 400));
      }
      if (order.courier_id && order.courier_id !== courier_id) {
        return next(new AppError("Order sudah memiliki kurir.", 400));
      }
      if (order.status !== "LOOKING_FOR_DRIVER") {
        return next(new AppError("Kurir hanya bisa ditugaskan saat order mencari kurir.", 400));
      }

      await sequelize.transaction(async (t) => {
        await order.update(
          {
            courier_id,
            status: "ON_PROCESS",
            ...updates,
          },
          { transaction: t }
        );

        await courier.update(
          {
            status: "BUSY",
            current_order_id: order.order_id,
          },
          { transaction: t }
        );
      });

      const refreshed = await Order.findOne({
        where: { order_id: id },
        include: [
          { model: User, as: "user", attributes: ["name", "phone"] },
          { model: Courier, as: "courier", attributes: ["id", "name", "phone", "status"] },
        ],
      });

      setImmediate(async () => {
        try {
          const ref = refreshed;
          const chatMessages = ref?.chat_messages || [];
          if (ref?.courier?.phone) {
            const courierText = courierAssignedByAdmin(
              ref.courier?.name,
              ref?.user?.name || "Pelanggan",
              ref?.user?.phone || ref?.user_phone || "",
              chatMessages
            );
            await messageService.sendMessage(ref.courier.phone, courierText).catch((e) => logger.error("Assign notify courier:", e.message));
          }
          if (ref?.user_phone && String(ref.user_phone).trim().startsWith("62")) {
            const customerText = customerCourierAssignedByAdmin(
              ref?.user?.name || "Pelanggan",
              ref?.order_id,
              ref?.short_code,
              ref?.courier?.name || "Kurir",
              ref?.courier?.phone || "",
              chatMessages
            );
            await messageService.sendMessage(ref.user_phone, customerText).catch((e) => logger.error("Assign notify customer:", e.message));
          }
        } catch (err) {
          logger.error(`Error send assign notifications: ${err.message}`);
        }
      });

      return res.status(200).json({
        status: "success",
        message: "Order berhasil diperbarui.",
        data: refreshed,
      });
    }

    await order.update(updates);

    const refreshed = await Order.findOne({
      where: { order_id: id },
      include: [
        { model: User, as: "user", attributes: ["name", "phone"] },
        { model: Courier, as: "courier", attributes: ["id", "name", "phone", "status"] },
      ],
    });

    return res.status(200).json({
      status: "success",
      message: "Order berhasil diperbarui.",
      data: refreshed,
    });
  } catch (error) {
    logger.error(`Error updateOrder: ${error.message}`);
    next(error);
  }
};

const CANCELLABLE_STATUSES = ["DRAFT", "PENDING_CONFIRMATION", "LOOKING_FOR_DRIVER"];

// Batalkan order oleh admin (Order Monitor). Hanya untuk status DRAFT, PENDING_CONFIRMATION, LOOKING_FOR_DRIVER. Kirim notif WA ke pelanggan.
export const cancelOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ where: { order_id: id } });
    if (!order) {
      return next(new AppError("Order tidak ditemukan", 404));
    }
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return next(
        new AppError(
          `Order hanya bisa dibatalkan saat status ${CANCELLABLE_STATUSES.join(", ")}.`,
          400
        )
      );
    }
    await cancelOrderAndNotify(order, "admin");
    const refreshed = await Order.findByPk(id, {
      include: [
        { model: User, as: "user", attributes: ["name", "phone"] },
        { model: Courier, as: "courier", attributes: ["id", "name", "phone", "status"] },
      ],
    });
    return res.status(200).json({
      status: "success",
      message: "Order telah dibatalkan dan pelanggan telah diberitahu.",
      data: refreshed,
    });
  } catch (error) {
    logger.error(`Error cancelOrder: ${error.message}`);
    next(error);
  }
};

// Daftar kurir eligible untuk order (idle, shift aktif, terdekat ke lokasi pickup) — untuk assign di Order Monitor
export const getEligibleCouriersForOrder = async (req, res, next) => {
  try {
    const { id: orderId } = req.params;
    const couriers = await dispatchService.getEligibleCouriersForOrder(orderId);
    res.status(200).json({
      status: "success",
      data: couriers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        shift_code: c.shift_code,
        current_latitude: c.current_latitude,
        current_longitude: c.current_longitude,
      })),
    });
  } catch (error) {
    logger.error(`Error getEligibleCouriersForOrder: ${error.message}`);
    next(error);
  }
};

// Daftar pelanggan (untuk dropdown Tambah Order by Admin) — user yang punya order atau semua user
export const getCustomers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ["phone", "name"],
      order: [["last_order_date", "DESC"], ["created_at", "DESC"]],
      limit: 200,
    });
    res.status(200).json({
      status: "success",
      data: users.map((u) => ({ phone: u.phone, name: u.name || "Pelanggan" })),
    });
  } catch (error) {
    logger.error(`Error getCustomers: ${error.message}`);
    next(error);
  }
};

// Buat order oleh admin; status langsung LOOKING_FOR_DRIVER; kirim ke customer & dispatch ke kurir
export const createOrderByAdmin = async (req, res, next) => {
  try {
    const { user_phone, customer_name, chat_messages: chatMessagesBody } = req.body;

    if (!user_phone || !String(user_phone).trim()) {
      return next(new AppError("Nomor HP pelanggan wajib diisi.", 400));
    }

    const chatMessages = Array.isArray(chatMessagesBody)
      ? chatMessagesBody.map((m) => (typeof m === "string" ? m : m?.body ?? String(m))).filter(Boolean)
      : [];
    if (chatMessages.length === 0) {
      return next(new AppError("Minimal satu pesan order (chat_messages) wajib diisi.", 400));
    }

    const { order, user } = await orderService.createByAdmin({
      user_phone: String(user_phone).trim(),
      customer_name: customer_name ? String(customer_name).trim() : null,
      chat_messages: chatMessages,
    });

    const orderWithUser = await Order.findByPk(order.order_id, {
      include: [{ model: User, as: "user", attributes: ["name", "phone"] }],
    });

    // Kirim pesan ke customer (format detail order, tanpa link koordinat — koordinat nanti ke kurir)
    try {
      const customerMessage = buildOrderCreatedByAdminCustomerMessage(orderWithUser, orderWithUser?.user);
      await messageService.sendMessage(orderWithUser.user_phone, customerMessage);
    } catch (err) {
      logger.error(`Error send order confirmation to customer: ${err.message}`);
    }

    // Dispatch ke kurir idle
    dispatchService.findDriverForOrder(order.order_id).catch((err) => {
      logger.error(`Dispatch error after admin order: ${err.message}`);
    });

    res.status(201).json({
      status: "success",
      message: "Order berhasil dibuat. Pesan konfirmasi dikirim ke pelanggan dan order ditawarkan ke kurir.",
      data: orderWithUser,
    });
  } catch (error) {
    logger.error(`Error createOrderByAdmin: ${error.message}`);
    next(error);
  }
};
