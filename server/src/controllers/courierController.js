import { Courier } from "../models/index.js";
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { sanitizePhoneNumber } from "../utils/formatter.js";
import { dispatchService } from "../services/dispatchService.js";
import { redisClient } from "../config/redisClient.js";

// Get all couriers
export const getAllCouriers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      shift,
      sortBy = "created_at",
      order = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    const whereClause = {};

    // Search (Nama atau No HP)
    if (search) {
      const cleanSearchPhone = sanitizePhoneNumber(search);

      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        // Cari berdasarkan string asli ATAU format 62 (jika valid)
        { phone: { [Op.like]: `%${search}%` } },
      ];

      if (cleanSearchPhone) {
        whereClause[Op.or].push({ phone: { [Op.like]: `%${cleanSearchPhone}%` } });
      }
    }

    // Filter Status
    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    // Filter Shift
    if (shift && shift !== "ALL") {
      whereClause.shift_code = shift;
    }

    // Sorting
    const allowedSorts = ["created_at", "name", "last_active_at", "status"];
    const validSort = allowedSorts.includes(sortBy) ? sortBy : "created_at";
    const validOrder = ["ASC", "DESC"].includes(order?.toUpperCase())
      ? order.toUpperCase()
      : "DESC";

    const { count, rows } = await Courier.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[validSort, validOrder]],
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
    logger.error(`Error in getAllCouriers: ${error.message}`);
    next(error);
  }
};

// Create courier
export const createCourier = async (req, res, next) => {
  try {
    const { name, phone, shift_code } = req.body;

    // Validasi Basic
    if (!name || !phone) {
      return next(new AppError("Nama dan No HP wajib diisi.", 400));
    }

    const cleanPhone = sanitizePhoneNumber(phone);
    if (!cleanPhone) {
      logger.warn(`Admin failed to input courier. Invalid mobile number: ${phone}`);
      return next(new AppError("Format Nomor HP tidak valid (Min 10-15 digit).", 400));
    }

    // Cek Duplikat
    const existing = await Courier.findOne({ where: { phone: cleanPhone } });
    if (existing) {
      logger.warn(`Courier data duplication: ${cleanPhone}`);
      return next(new AppError(`No HP ${cleanPhone} sudah terdaftar.`, 400));
    }

    // Create Data
    const newCourier = await Courier.create({
      name,
      phone: cleanPhone,
      shift_code: shift_code || 1,
      status: "OFFLINE",
      is_active: true,
    });

    logger.info(`New courier added by Admin: ${name} (${cleanPhone})`);

    res.status(201).json({
      status: "success",
      message: "Kurir berhasil didaftarkan.",
      data: newCourier,
    });
  } catch (error) {
    logger.error(`Error createCourier: ${error.message}`);
    next(error);
  }
};

// Update courier
export const updateCourier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, shift_code, status, is_active, current_latitude, current_longitude } =
      req.body;

    const courier = await Courier.findByPk(id);
    if (!courier) return next(new AppError("Kurir tidak ditemukan", 404));
    const previousStatus = courier.status;

    // Update Name
    if (name) courier.name = name;

    if (phone) {
      const cleanPhone = sanitizePhoneNumber(phone);
      if (!cleanPhone) {
        return next(new AppError("Format Nomor HP baru tidak valid.", 400));
      }

      // Cek apakah nomor dipakai orang lain (kecuali diri sendiri)
      if (cleanPhone !== courier.phone) {
        const duplicate = await Courier.findOne({ where: { phone: cleanPhone } });
        if (duplicate) return next(new AppError("No HP sudah digunakan kurir lain.", 400));

        courier.phone = cleanPhone;
      }
    }

    if (shift_code) courier.shift_code = shift_code;
    if (status) courier.status = status;
    if (is_active !== undefined) courier.is_active = is_active;

    let locationChanged = false;
    if (current_latitude !== undefined && current_longitude !== undefined) {
      courier.current_latitude = current_latitude;
      courier.current_longitude = current_longitude;
      courier.last_active_at = new Date();
      locationChanged = true;
    }

    await courier.save();

    if (status) {
      if (courier.status === "IDLE") {
        await redisClient.sAdd("online_couriers", String(courier.id));
        if (previousStatus !== "IDLE") {
          await dispatchService.offerPendingOrdersToCourier(courier);
        }
      } else {
        await redisClient.sRem("online_couriers", String(courier.id));
      }
    }

    logger.info(`Courier data updated: ${courier.name} (ID: ${id})`);

    if (req.io && locationChanged) {
      req.io.emit("courier-location-update", {
        id: courier.id,
        name: courier.name,
        phone: courier.phone,
        lat: parseFloat(courier.current_latitude),
        lng: parseFloat(courier.current_longitude),
        status: courier.status,
        updatedAt: courier.last_active_at,
      });
      // console.log(`Socket Emitted: ${courier.name} moved to ${current_latitude}, ${current_longitude}`);
    }

    res.status(200).json({
      status: "success",
      message: "Data kurir berhasil di update.",
    });
  } catch (error) {
    logger.error(`Error updateCourier: ${error.message}`);
    next(error);
  }
};

// Delete courier
export const deleteCourier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await Courier.destroy({ where: { id } });

    if (!deleted) return next(new AppError("Kurir tidak ditemukan", 404));

    logger.info(`Courier permanently deleted.`);

    res.status(200).json({
      status: "success",
      message: "Kurir berhasil dihapus.",
    });
  } catch (error) {
    logger.error(`Error deleteCourier: ${error.message}`);
    next(error);
  }
};
