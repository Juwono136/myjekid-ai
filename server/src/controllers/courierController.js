import { Courier, Order } from "../models/index.js";
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { sanitizePhoneNumber } from "../utils/formatter.js";
import { redisClient } from "../config/redisClient.js";

import { BASE_CAMP_LAT, BASE_CAMP_LNG } from "../config/baseCamp.js";

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

    // Create Data — status IDLE (online) saat pertama ditambahkan admin
    // Set koordinat default ke base camp dengan sedikit random offset agar tidak menumpuk persis di satu titik
    const randomOffsetLat = (Math.random() - 0.5) * 0.001;
    const randomOffsetLng = (Math.random() - 0.5) * 0.001;
    
    const newCourier = await Courier.create({
      name,
      phone: cleanPhone,
      shift_code: shift_code || 1,
      status: "IDLE",
      is_active: true,
      current_latitude: BASE_CAMP_LAT + randomOffsetLat,
      current_longitude: BASE_CAMP_LNG + randomOffsetLng,
    });

    await redisClient.sAdd("online_couriers", String(newCourier.id));

    const { dispatchService } = await import("../services/dispatchService.js");
    dispatchService
      .offerPendingOrdersToCourier(newCourier, 5, { forceOfferToThisCourier: true })
      .then((n) => {
        if (n > 0) logger.info(`Offered ${n} pending order(s) to new courier ${newCourier.id}.`);
      })
      .catch((err) => logger.error(`offerPendingOrdersToCourier for new courier: ${err.message}`));

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
    if (status) {
      const allowedStatuses = ["OFFLINE", "IDLE", "SUSPEND"];
      if (!allowedStatuses.includes(status)) {
        return next(new AppError("Status hanya bisa diubah ke OFFLINE, IDLE, atau SUSPEND.", 400));
      }
      if (courier.current_order_id) {
        const activeOrder = await Order.findOne({
          where: {
            order_id: courier.current_order_id,
            status: { [Op.in]: ["ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
          },
        });
        if (activeOrder) {
          return next(
            new AppError(
              "Kurir masih memiliki order aktif. Status tidak bisa diubah sekarang.",
              400
            )
          );
        }
      }

      courier.status = status;
      if (status === "OFFLINE") {
        courier.device_id = null;
      }
      if (status === "SUSPEND") {
        courier.is_active = false;
      }
    }
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
      if (status === "OFFLINE" || status === "SUSPEND") {
        await redisClient.sRem("online_couriers", String(courier.id));
      } else if (status === "IDLE" && courier.is_active !== false) {
        await redisClient.sAdd("online_couriers", String(courier.id));
        // Langsung tawarkan order LOOKING_FOR_DRIVER ke kurir ini (1 pesan WA per order)
        const { dispatchService } = await import("../services/dispatchService.js");
        dispatchService
          .offerPendingOrdersToCourier(courier, 5, { forceOfferToThisCourier: true })
          .then((n) => {
            if (n > 0) logger.info(`Offered ${n} pending order(s) to courier ${courier.id} after set IDLE.`);
          })
          .catch((err) => logger.error(`offerPendingOrdersToCourier after set IDLE: ${err.message}`));
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
