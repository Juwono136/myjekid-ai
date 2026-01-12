import { Admin } from "../models/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import {
  validateAndNormalizePhoneNumber,
  validateEmail,
  validatePassword,
} from "../utils/validators.js";

const JWT_SECRET = process.env.JWT_SECRET;

// Login admin
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
        phone: admin.phone,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Me (admin data)
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

// update profile
export const updateProfile = async (req, res, next) => {
  try {
    // Ambil ID dari Token
    const adminId = req.user.id;
    const { full_name, phone } = req.body;

    // Validasi Input
    if (!full_name || !phone) {
      return next(new AppError("Nama Lengkap dan Nomor HP wajib diisi.", 400));
    }

    if (!validateAndNormalizePhoneNumber(phone)) {
      return next(new AppError("Nomor HP tidak valid.", 400));
    }

    // Cari Admin
    const admin = await Admin.findByPk(adminId);
    if (!admin) {
      return next(new AppError("User tidak ditemukan.", 404));
    }

    // Update Data
    await admin.update({
      full_name: full_name,
      phone: phone,
    });

    logger.info(`Admin ID ${adminId} updated their profile.`);

    res.status(200).json({
      status: "success",
      message: "Profil berhasil diperbarui.",
      data: {
        id: admin.id,
        name: admin.full_name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// update password
export const updatePassword = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validasi Input Dasar
    if (!currentPassword || !newPassword || !confirmPassword) {
      return next(new AppError("Mohon lengkapi semua input password.", 400));
    }

    // Cek Kesamaan Password Baru
    if (newPassword !== confirmPassword) {
      return next(new AppError("Konfirmasi password baru tidak cocok.", 400));
    }

    // Validasi Password
    if (!validatePassword(newPassword)) {
      return next(
        new AppError(
          "Password minimal 8 karakter, terdiri dari minimal1 huruf besar, huruf kecil dan angka",
          400
        )
      );
    }

    // Cari Admin
    const admin = await Admin.findByPk(adminId);
    if (!admin) {
      return next(new AppError("User tidak ditemukan.", 404));
    }

    // Verifikasi Password Lama
    const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isMatch) {
      return next(new AppError("Password lama Anda salah.", 401));
    }

    // Cek apakah password baru sama dengan password lama
    if (currentPassword === newPassword) {
      return next(new AppError("Password baru tidak boleh sama dengan password lama.", 400));
    }

    // 7. Hash Password Baru & Simpan
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await admin.update({ password_hash: newHash });

    logger.info(`Admin ID ${adminId} changed their password.`);

    res.status(200).json({
      status: "success",
      message: "Password berhasil diubah. Silakan login kembali dengan password baru.",
    });
  } catch (error) {
    next(error);
  }
};
