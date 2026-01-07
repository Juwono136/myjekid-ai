import { Order, User } from "../models/index.js";
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";

// --- 1. GET ALL ORDERS (Monitor List) ---
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

    // 1. Filter Status
    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    // 2. Search Logic
    if (search) {
      whereClause[Op.or] = [
        { order_id: { [Op.iLike]: `%${search}%` } },
        { user_phone: { [Op.like]: `%${search}%` } },
      ];
    }

    // 3. Sorting Logic (Diperketat)
    // Map parameter frontend ke nama kolom database/model yang valid
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
      order: [[dbSortField, dbSortDirection]], // Gunakan hasil mapping
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

// --- 2. GET ORDER DETAIL (PERBAIKAN UTAMA DISINI) ---
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      where: { order_id: id },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["name", "phone"], // Ambil info user
        },
        // HAPUS include OrderItem karena tabelnya tidak ada
      ],
    });

    if (!order) {
      return next(new AppError("Order tidak ditemukan", 404));
    }

    // items_summary sudah otomatis diambil sebagai bagian dari objek 'order'

    res.status(200).json({
      status: "success",
      data: order,
    });
  } catch (error) {
    logger.error(`Error getOrderById: ${error.message}`);
    next(error);
  }
};
