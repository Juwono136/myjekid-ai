import { Courier } from "../models/index.js"; // Import dari sentral model
import { Op } from "sequelize";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js"; // Import Logger Anda
import { sanitizePhoneNumber } from "../utils/formatter.js"; // Reuse function lama

// --- 1. GET ALL COURIERS (Monitor) ---
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

    // Filter Logic
    const whereClause = {};

    // Search (Nama atau No HP)
    if (search) {
      // Kita coba bersihkan search query juga, siapa tahu admin search pake 08xxx
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

// --- 2. CREATE COURIER (Registrasi) ---
export const createCourier = async (req, res, next) => {
  try {
    const { name, phone, shift_code } = req.body;

    // 1. Validasi Basic
    if (!name || !phone) {
      return next(new AppError("Nama dan No HP wajib diisi.", 400));
    }

    // 2. Sanitasi Nomor HP (PENTING: Agar match dengan WA Bot)
    const cleanPhone = sanitizePhoneNumber(phone);
    if (!cleanPhone) {
      logger.warn(`Admin gagal input kurir. No HP tidak valid: ${phone}`);
      return next(new AppError("Format Nomor HP tidak valid (Min 10-15 digit).", 400));
    }

    // 3. Cek Duplikat
    const existing = await Courier.findOne({ where: { phone: cleanPhone } });
    if (existing) {
      logger.warn(`Percobaan duplikasi data kurir: ${cleanPhone}`);
      return next(new AppError(`No HP ${cleanPhone} sudah terdaftar.`, 400));
    }

    // 4. Create Data
    const newCourier = await Courier.create({
      name,
      phone: cleanPhone, // Simpan format 628xxx
      shift_code: shift_code || 1,
      status: "OFFLINE",
      is_active: true,
    });

    logger.info(`Kurir baru ditambahkan oleh Admin: ${name} (${cleanPhone})`);

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

// --- 3. UPDATE COURIER ---
export const updateCourier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, shift_code, status, is_active } = req.body;

    const courier = await Courier.findByPk(id);
    if (!courier) return next(new AppError("Kurir tidak ditemukan", 404));

    // Update Name
    if (name) courier.name = name;

    // Update Phone (Harus sanitasi ulang & Cek duplikat jika berubah)
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

    await courier.save();

    logger.info(`Data kurir diupdate: ${courier.name} (ID: ${id})`);

    res.status(200).json({
      status: "success",
      message: "Data kurir berhasil diperbarui.",
    });
  } catch (error) {
    logger.error(`Error updateCourier: ${error.message}`);
    next(error);
  }
};

// --- 4. DELETE COURIER ---
export const deleteCourier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await Courier.destroy({ where: { id } });

    if (!deleted) return next(new AppError("Kurir tidak ditemukan", 404));

    logger.info(`Kurir dihapus permanen.`);

    res.status(200).json({
      status: "success",
      message: "Data kurir dihapus dari database.",
    });
  } catch (error) {
    logger.error(`Error deleteCourier: ${error.message}`);
    next(error);
  }
};
