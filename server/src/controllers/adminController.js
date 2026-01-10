import { Admin, Order, Courier, User, ChatSession, sequelize } from "../models/index.js";
import { Op, QueryTypes } from "sequelize";
import bcrypt from "bcryptjs";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import {
  validateAndNormalizePhoneNumber,
  validateEmail,
  validatePassword,
} from "../utils/validators.js";

// API untuk Admin mematikan/menyalakan Bot user tertentu (Switch mode)
export const setSessionMode = async (req, res) => {
  const { phone, mode, duration_minutes } = req.body;

  try {
    const session = await ChatSession.findOne({ where: { phone } });

    if (!session) {
      return res.status(404).json({ error: "Session user tidak ditemukan" });
    }

    let updateData = { mode };

    // Jika mode HUMAN/PAUSE, set timer otomatis
    if (mode === "HUMAN") {
      const pausedUntil = new Date();
      // Default pause 30 menit jika tidak ditentukan
      const duration = duration_minutes || 30;
      pausedUntil.setMinutes(pausedUntil.getMinutes() + duration);

      updateData.paused_until = pausedUntil;
    } else if (mode === "BOT") {
      updateData.paused_until = null; // Reset timer
    }

    await session.update(updateData);

    return res.json({
      message: `Sukses ubah mode ke ${mode} untuk user ${phone}`,
      data: updateData,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// --- 1. GET ALL ADMINS (Search, Filter, Sort, Pagination) ---
export const getAllAdmins = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      role,
      sortBy = "created_at",
      order = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    // A. Filter Logic
    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { full_name: { [Op.iLike]: `%${search}%` } }, // Case insensitive untuk Postgres
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Filter Role (Hanya jika bukan 'ALL')
    if (role && role !== "ALL") {
      whereClause.role = role;
    }

    // B. Sorting Logic (Whitelist Field agar aman dari SQL Injection)
    const allowedSortFields = ["created_at", "full_name", "email", "last_login"];

    // Validasi field sort (fallback ke created_at jika input aneh)
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";

    // Validasi direction (fallback ke DESC)
    const validOrder = ["ASC", "DESC"].includes(order?.toUpperCase())
      ? order.toUpperCase()
      : "DESC";

    const { count, rows } = await Admin.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[validSortBy, validOrder]], // Format Sequelize: [['field', 'DESC']]
      attributes: { exclude: ["password_hash"] }, // Security: Jangan kirim hash password
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
    next(error);
  }
};

// --- 2. CREATE ADMIN (Validation & Hash) ---
export const createAdmin = async (req, res, next) => {
  try {
    const { full_name, email, password, phone, role } = req.body;

    // 1. Validasi Input Wajib
    if (!full_name || !email || !password || !phone) {
      return next(new AppError("Nama, Email, No. HP dan Password wajib diisi.", 400));
    }

    // 2. Validasi Format (Regex)
    if (!validateEmail(email)) {
      return next(new AppError("Format Email tidak valid.", 400));
    }
    if (!validatePassword(password)) {
      return next(
        new AppError("Password lemah! Gunakan Huruf Besar, Kecil, Angka, min 8 karakter.", 400)
      );
    }
    if (!validateAndNormalizePhoneNumber(phone)) {
      return next(new AppError("Nomor HP tidak valid.", 400));
    }

    // 3. Cek Duplikasi Email
    const existing = await Admin.findOne({ where: { email } });
    if (existing) {
      return next(new AppError("Email sudah terdaftar.", 400));
    }

    // 4. Hash Password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 5. Simpan ke DB
    const newAdmin = await Admin.create({
      full_name,
      email,
      password_hash,
      phone,
      role: role || "CS",
      is_active: true,
    });

    logger.info(`New User Created: ${email} by ${req.user?.email || "Unknown"}`);

    res.status(201).json({
      status: "success",
      message: "User berhasil dibuat",
      data: {
        id: newAdmin.id,
        email: newAdmin.email,
        full_name: newAdmin.full_name,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// --- 3. UPDATE ADMIN (Restricted Fields) ---
export const updateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, is_active } = req.body; // Hanya ambil field aman

    const admin = await Admin.findByPk(id);
    if (!admin) {
      return next(new AppError("User tidak ditemukan", 404));
    }

    // Proteksi: Tidak bisa menonaktifkan diri sendiri
    if (req.user && id === req.user.id && is_active === false) {
      return next(new AppError("Anda tidak dapat menonaktifkan akun sendiri.", 400));
    }

    // Update Field jika dikirim
    if (role) admin.role = role;
    if (is_active !== undefined) admin.is_active = is_active;

    await admin.save();

    logger.info(`User Updated: ${admin.email} (Role/Status) by ${req.user?.email}`);

    res.status(200).json({
      status: "success",
      message: "Data akses user berhasil diperbarui",
    });
  } catch (error) {
    next(error);
  }
};

// --- 4. DELETE ADMIN ---
export const deleteAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Proteksi: Tidak bisa hapus diri sendiri
    if (req.user && id === req.user.id) {
      return next(new AppError("Anda tidak dapat menghapus akun sendiri.", 400));
    }

    const admin = await Admin.findByPk(id);
    if (!admin) return next(new AppError("User tidak ditemukan", 404));

    await admin.destroy();

    logger.warn(`User Deleted: ${admin.email} by ${req.user?.email}`);

    res.status(200).json({
      status: "success",
      message: "User berhasil dihapus",
    });
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // --- Metrics ---
    const revRaw = await Order.sum("total_amount", {
      where: { status: "COMPLETED", created_at: { [Op.gte]: startOfMonth } },
    });
    const revenueMonth = parseFloat(revRaw) || 0;
    const ordersMonth = await Order.count({ where: { created_at: { [Op.gte]: startOfMonth } } });
    const ordersToday = await Order.count({ where: { created_at: { [Op.gte]: startOfToday } } });
    const activeCouriers = await Courier.count({
      where: { status: { [Op.or]: ["IDLE", "BUSY"] }, is_active: true },
    });
    const pendingOrders = await Order.count({
      where: { status: { [Op.notIn]: ["COMPLETED", "CANCELLED"] } },
    });

    // --- Recent Orders ---
    const recentOrders = await Order.findAll({
      limit: 5,
      order: [["created_at", "DESC"]],
      attributes: [
        "order_id",
        "total_amount",
        "status",
        "created_at",
        "items_summary",
        "user_phone",
      ],
    });

    res.status(200).json({
      status: "success",
      data: {
        stats: { revenueMonth, ordersMonth, ordersToday, activeCouriers, pendingOrders },
        recentOrders,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. FUNGSI BARU: KHUSUS UNTUK CHART (INDEPENDEN)
export const getChartData = async (req, res, next) => {
  try {
    const type = String(req.query.type || "").toLowerCase();
    const range = req.query.range || "7days";

    if (!["revenue", "distribution"].includes(type)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid chart type",
      });
    }

    // =========================
    // 1. TENTUKAN ANCHOR DATE
    // =========================
    let anchorDate = new Date();

    if (type === "revenue") {
      const lastCompleted = await Order.findOne({
        where: { status: "COMPLETED" },
        order: [["created_at", "DESC"]],
        attributes: ["created_at"],
      });
      if (lastCompleted) anchorDate = new Date(lastCompleted.created_at);
    } else {
      const lastOrder = await Order.findOne({
        order: [["created_at", "DESC"]],
        attributes: ["created_at"],
      });
      if (lastOrder) anchorDate = new Date(lastOrder.created_at);
    }

    // =========================
    // 2. START DATE
    // =========================
    let startDate = new Date(anchorDate);

    if (range === "30days") startDate.setDate(anchorDate.getDate() - 29);
    else if (range === "1year") startDate.setFullYear(anchorDate.getFullYear() - 1);
    else startDate.setDate(anchorDate.getDate() - 6);

    startDate.setHours(0, 0, 0, 0);

    let resultData = [];

    // =========================
    // 3. REVENUE
    // =========================
    if (type === "revenue") {
      const rawData = await sequelize.query(
        `
        SELECT DATE(created_at) AS date, SUM(total_amount) AS income
        FROM orders
        WHERE status = 'COMPLETED'
          AND created_at >= :startDate
          AND created_at <= :endDate
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC
        `,
        {
          replacements: { startDate, endDate: anchorDate },
          type: QueryTypes.SELECT,
        }
      );

      const diffDays = Math.ceil((anchorDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      for (let i = 0; i < diffDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateString = d.toLocaleDateString("en-CA");

        const match = rawData.find((r) => String(r.date).substring(0, 10) === dateString);

        resultData.push({
          date: dateString,
          displayDate: d.toISOString(),
          income: match ? Number(match.income) : 0,
        });
      }
    }

    // =========================
    // 4. DISTRIBUTION (AMAN)
    // =========================
    else {
      const rawStatus = await sequelize.query(
        `
        SELECT status, COUNT(*) AS count
        FROM orders
        WHERE created_at >= :startDate
          AND created_at <= :endDate
        GROUP BY status
        `,
        {
          replacements: { startDate, endDate: anchorDate },
          type: QueryTypes.SELECT,
        }
      );

      // Normalisasi di JS (AMAN)
      resultData = rawStatus.map((r) => ({
        name: String(r.status).toUpperCase(),
        value: Number(r.count),
      }));
    }

    res.status(200).json({
      status: "success",
      data: resultData,
    });
  } catch (error) {
    console.error("[CHART ERROR]", error);
    next(error);
  }
};
