import { Admin } from "../models/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { validateEmail } from "../utils/validators.js";

const JWT_SECRET = process.env.JWT_SECRET || "rahasia_negara_myjek_sumbawa_2025";

export const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validasi Input Dasar
    if (!email || !password) {
      return next(new AppError("Email dan Password wajib diisi!", 400));
    }

    // Validasi Format Email & Password Strength
    if (!validateEmail(email)) {
      return next(new AppError("Format Email tidak valid!", 400));
    }

    // Cari Admin di Database
    const admin = await Admin.findOne({ where: { email } });

    if (!admin) {
      logger.warn(`Failed login attempt (Email not found): ${email}`);
      return next(new AppError("Email atau Password salah!", 401));
    }

    // Cek Password Hash
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      logger.warn(`Failed login attempt (Wrong password): ${email}`);
      return next(new AppError("Email atau Password salah!", 401));
    }

    // Cek Status Aktif
    if (!admin.is_active) {
      return next(new AppError("Akun Anda telah dinonaktifkan. Hubungi Super Admin.", 403));
    }

    // Update Last Login
    await admin.update({ last_login: new Date() });

    // Generate Token
    const token = jwt.sign({ id: admin.id, role: admin.role, email: admin.email }, JWT_SECRET, {
      expiresIn: "1d",
    });

    logger.info(`Admin Login Success: ${email}`);

    res.status(200).json({
      status: "success",
      message: "Login Berhasil",
      token,
      data: {
        id: admin.id,
        name: admin.full_name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    // Kirim ke Global Error Handler
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const admin = await Admin.findByPk(req.user.id, {
      attributes: { exclude: ["password_hash"] },
    });

    if (!admin) {
      return next(new AppError("User tidak ditemukan.", 404));
    }

    res.status(200).json({
      status: "success",
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};
