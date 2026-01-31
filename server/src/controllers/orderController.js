import { Courier, Order, User } from "../models/index.js";
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { sequelize } from "../config/database.js";
import { aiService } from "../services/ai/AIService.js";
import { messageService } from "../services/messageService.js";

const normalizeNotesList = (notes = []) =>
  Array.isArray(notes)
    ? notes
        .map((note) => (typeof note === "string" ? note : note?.note))
        .filter(Boolean)
    : [];

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

    const offset = (page - 1) * limit;
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
      limit: parseInt(limit),
      offset: parseInt(offset),
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
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
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

// Update order detail (Admin/CS)
export const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      items_summary,
      pickup_address,
      delivery_address,
      order_notes,
      courier_id,
    } = req.body;

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

    if (items_summary !== undefined) {
      if (!Array.isArray(items_summary)) {
        return next(new AppError("Format items_summary harus berupa array.", 400));
      }
      updates.items_summary = items_summary.map((item) => ({
        item: item.item || "Item",
        qty: Number(item.qty) || 1,
        note: item.note || "",
      }));
    }

    if (pickup_address !== undefined) {
      updates.pickup_address = pickup_address || "";
    }

    if (delivery_address !== undefined) {
      updates.delivery_address = delivery_address || "";
    }

    if (order_notes !== undefined) {
      if (!Array.isArray(order_notes)) {
        return next(new AppError("Format order_notes harus berupa array.", 400));
      }
      updates.order_notes = order_notes
        .map((note) => (typeof note === "string" ? note : note?.note))
        .filter(Boolean)
        .map((note) => ({ note, at: new Date().toISOString() }));
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

      try {
        const updateItems = Array.isArray(items_summary) ? items_summary : [];
        const updateNotes = normalizeNotesList(order_notes || []);
        const addressChanged =
          pickup_address !== undefined || delivery_address !== undefined;
        if (!updateItems.length && !updateNotes.length && addressChanged) {
          if (pickup_address !== undefined) {
            updateItems.push({ item: "Update alamat pickup", qty: 1 });
          }
          if (delivery_address !== undefined) {
            updateItems.push({ item: "Update alamat antar", qty: 1 });
          }
        }

        const customerReply = await aiService.generateReply({
          role: "CUSTOMER",
          status: "ORDER_UPDATE_APPLIED",
          context: {
            role: "CUSTOMER",
            user_name: refreshed?.user?.name || "Customer",
            order_status: refreshed?.status,
            items: refreshed?.items_summary || [],
            pickup: refreshed?.pickup_address || "",
            address: refreshed?.delivery_address || "",
            notes: normalizeNotesList(refreshed?.order_notes || []),
            update_items: updateItems,
            update_notes: updateNotes,
            flags: { show_details: false },
            last_message: "",
          },
        });
        if (refreshed?.user_phone) {
          await messageService.sendMessage(refreshed.user_phone, customerReply);
        }

        if (refreshed?.courier?.phone) {
          const courierReply = await aiService.generateReply({
            role: "COURIER",
            status: "ORDER_UPDATE_APPLIED",
            context: {
              role: "COURIER",
              courier_name: refreshed?.courier?.name || "Kurir",
              order_status: refreshed?.status,
              items: refreshed?.items_summary || [],
              pickup: refreshed?.pickup_address || "",
              address: refreshed?.delivery_address || "",
              notes: normalizeNotesList(refreshed?.order_notes || []),
              flags: { show_details: true },
              last_message: "",
            },
            required_phrases: [
              "Halo rider, ada update pesanan order dari pelanggan nih! 😊",
              "Berikut detail ordernya saat ini:",
            ],
          });
          await messageService.sendMessage(refreshed.courier.phone, courierReply);
        }
      } catch (err) {
        logger.error(`Error send update notifications: ${err.message}`);
      }

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

    try {
      const updateItems = Array.isArray(items_summary) ? items_summary : [];
      const updateNotes = normalizeNotesList(order_notes || []);
      const addressChanged =
        pickup_address !== undefined || delivery_address !== undefined;
      if (!updateItems.length && !updateNotes.length && addressChanged) {
        if (pickup_address !== undefined) {
          updateItems.push({ item: "Update alamat pickup", qty: 1 });
        }
        if (delivery_address !== undefined) {
          updateItems.push({ item: "Update alamat antar", qty: 1 });
        }
      }

      const customerReply = await aiService.generateReply({
        role: "CUSTOMER",
        status: "ORDER_UPDATE_APPLIED",
        context: {
          role: "CUSTOMER",
          user_name: refreshed?.user?.name || "Customer",
          order_status: refreshed?.status,
          items: refreshed?.items_summary || [],
          pickup: refreshed?.pickup_address || "",
          address: refreshed?.delivery_address || "",
          notes: normalizeNotesList(refreshed?.order_notes || []),
          update_items: updateItems,
          update_notes: updateNotes,
          flags: { show_details: false },
          last_message: "",
        },
      });
      if (refreshed?.user_phone) {
        await messageService.sendMessage(refreshed.user_phone, customerReply);
      }

      if (refreshed?.courier?.phone) {
        const courierReply = await aiService.generateReply({
          role: "COURIER",
          status: "ORDER_UPDATE_APPLIED",
          context: {
            role: "COURIER",
            courier_name: refreshed?.courier?.name || "Kurir",
            order_status: refreshed?.status,
            items: refreshed?.items_summary || [],
            pickup: refreshed?.pickup_address || "",
            address: refreshed?.delivery_address || "",
            notes: normalizeNotesList(refreshed?.order_notes || []),
            flags: { show_details: true },
            last_message: "",
          },
          required_phrases: [
            "Halo rider, ada update pesanan order dari pelanggan nih! 😊",
            "Berikut detail ordernya saat ini:",
          ],
        });
        await messageService.sendMessage(refreshed.courier.phone, courierReply);
      }
    } catch (err) {
      logger.error(`Error send update notifications: ${err.message}`);
    }

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
