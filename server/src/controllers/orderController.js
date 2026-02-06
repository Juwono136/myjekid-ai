import { Courier, Order, User } from "../models/index.js";
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { sequelize } from "../config/database.js";
import { aiService } from "../services/ai/AIService.js";
import { messageService } from "../services/messageService.js";
import { orderService } from "../services/orderService.js";
import { dispatchService } from "../services/dispatchService.js";

const normalizeNotesList = (notes = []) =>
  Array.isArray(notes)
    ? notes
        .map((note) => (typeof note === "string" ? note : note?.note))
        .filter(Boolean)
    : [];

/** Pesan ramah untuk kirim link lokasi ke pelanggan (bukan hanya URL saja) */
const buildLocationLinkMessage = (userName, mapLink) =>
  `Kak ${userName || "pelanggan"}, berikut titik lokasi alamat antarnya ya. Bisa dibuka di Google Maps untuk panduan kurir:\n${mapLink}`;

/** Pesan ke pelanggan ketika order baru dibuat oleh admin (belum ada kurir) — format mirip COURIER_ASSIGNED tapi tanpa info kurir */
const buildOrderCreatedByAdminCustomerMessage = (order, user) => {
  const items = order.items_summary || [];
  const itemsList = items.map((i) => `- ${i.item} (x${i.qty})${(i.note && ` - ${i.note}`) || ""}`).join("\n");
  const notes = normalizeNotesList(order.order_notes || []);
  const notesList = notes.length ? `Catatan:\n${notes.map((n) => `- ${n}`).join("\n")}` : "";
  const customerName = user?.name || "Pelanggan";
  return (
    `Pesanan sudah kami catat kak ${customerName} 😊\n\n` +
    `🆔 Order ID: ${order.order_id} | Kode: ${order.short_code || "-"}\n\n` +
    `📦 Detail Pesanan:\n${itemsList || "-"}\n\n` +
    `📍 Pickup dari: ${order.pickup_address || "-"}\n` +
    `📍 Antar ke: ${order.delivery_address || "-"}\n` +
    (notesList ? `${notesList}\n\n` : "\n") +
    `Kami sedang carikan kurir. Silakan tunggu ya kak.\n\n` +
    `Catatan: jika saya salah dalam memahami maksud kakak atau terdapat komplain/masalah tentang proses order, silahkan ketik #HUMAN untuk beralih ke human mode, nanti akan ada admin yang chat kakak ya, mohon maaf sebelumnya kak 😅🙏`
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
          attributes: ["name", "phone", "latitude", "longitude"],
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
      latitude,
      longitude,
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

    if (latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude))) {
      const user = await User.findByPk(order.user_phone);
      if (user) {
        await user.update({ latitude: Number(latitude), longitude: Number(longitude) });
      }
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
          { model: User, as: "user", attributes: ["name", "phone", "latitude", "longitude"] },
          { model: Courier, as: "courier", attributes: ["id", "name", "phone", "status"] },
        ],
      });

      try {
        // Format mirip #AMBIL: kurir dapat ORDER_TAKEN (detail + instruksi lokasi), pelanggan dapat COURIER_ASSIGNED (detail + info kurir)
        if (refreshed?.courier?.phone) {
          const courierReply = await aiService.generateReply({
            role: "COURIER",
            status: "ORDER_TAKEN",
            context: {
              role: "COURIER",
              courier_name: refreshed?.courier?.name || "Kurir",
              courier_status: refreshed?.courier?.status || "BUSY",
              order_status: refreshed?.status,
              order_id: refreshed?.order_id,
              short_code: refreshed?.short_code,
              items: refreshed?.items_summary || [],
              pickup: refreshed?.pickup_address || "",
              address: refreshed?.delivery_address || "",
              notes: normalizeNotesList(refreshed?.order_notes || []),
              user_name: refreshed?.user?.name || "Pelanggan",
              user_phone: refreshed?.user?.phone || refreshed?.user_phone || "",
              flags: {
                customer_name: refreshed?.user?.name || "Pelanggan",
                customer_phone: refreshed?.user?.phone || refreshed?.user_phone || "",
                show_details: true,
              },
              last_message: "",
            },
          });
          await messageService.sendMessage(refreshed.courier.phone, courierReply);
          const lat = latitude != null && !Number.isNaN(Number(latitude)) ? Number(latitude) : refreshed?.user?.latitude;
          const lng = longitude != null && !Number.isNaN(Number(longitude)) ? Number(longitude) : refreshed?.user?.longitude;
          if (lat != null && lng != null) {
            const mapLink = `https://maps.google.com/maps?q=${lat},${lng}&z=17&hl=id`;
            const locationMessage = buildLocationLinkMessage(refreshed?.courier?.name, mapLink);
            await messageService.sendMessage(refreshed.courier.phone, locationMessage);
          }
        }
        if (refreshed?.user_phone) {
          const customerReply = await aiService.generateReply({
            role: "CUSTOMER",
            status: "COURIER_ASSIGNED",
            context: {
              role: "CUSTOMER",
              user_name: refreshed?.user?.name || "Customer",
              order_status: refreshed?.status,
              order_id: refreshed?.order_id,
              short_code: refreshed?.short_code,
              items: refreshed?.items_summary || [],
              pickup: refreshed?.pickup_address || "",
              address: refreshed?.delivery_address || "",
              notes: normalizeNotesList(refreshed?.order_notes || []),
              courier_name: refreshed?.courier?.name || "Kurir",
              courier_phone: refreshed?.courier?.phone || "",
            },
          });
          await messageService.sendMessage(refreshed.user_phone, customerReply);
        }
      } catch (err) {
        logger.error(`Error send assign notifications: ${err.message}`);
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
            order_id: refreshed?.order_id || null,
            short_code: refreshed?.short_code || null,
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
        // Kirim titik lokasi ke kurir (bukan pelanggan) jika admin mengubah koordinat — penting untuk panduan kurir
        if (latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude))) {
          const mapLink = `https://maps.google.com/maps?q=${Number(latitude)},${Number(longitude)}&z=17&hl=id`;
          const locationMessage = buildLocationLinkMessage(refreshed?.courier?.name, mapLink);
          await messageService.sendMessage(refreshed.courier.phone, locationMessage);
        }
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
    const {
      user_phone,
      customer_name,
      pickup_address,
      delivery_address,
      items_summary,
      order_notes,
      latitude,
      longitude,
    } = req.body;

    if (!user_phone || !delivery_address) {
      return next(new AppError("Nomor HP dan alamat antar wajib diisi.", 400));
    }
    if (!Array.isArray(items_summary) || items_summary.length === 0) {
      return next(new AppError("Minimal satu item pesanan wajib diisi.", 400));
    }

    const { order, user } = await orderService.createByAdmin({
      user_phone: String(user_phone).trim(),
      customer_name: customer_name ? String(customer_name).trim() : null,
      pickup_address: pickup_address ? String(pickup_address).trim() : "",
      delivery_address: String(delivery_address).trim(),
      items_summary,
      order_notes: Array.isArray(order_notes) ? order_notes : [],
      latitude: latitude != null && !Number.isNaN(Number(latitude)) ? Number(latitude) : null,
      longitude: longitude != null && !Number.isNaN(Number(longitude)) ? Number(longitude) : null,
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
