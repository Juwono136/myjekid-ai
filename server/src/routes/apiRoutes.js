// src/routes/apiRoutes.js
import express from "express";
import { loginAdmin, getMe } from "../controllers/authController.js";
import {
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getDashboardStats,
  getChartData,
} from "../controllers/adminController.js";
import {
  getAllCouriers,
  createCourier,
  updateCourier,
  deleteCourier,
} from "../controllers/courierController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { restrictTo } from "../middleware/roleMiddleware.js";

const router = express.Router();

// --- PUBLIC ROUTES (Bebas Akses) ---
router.post("/auth/login", loginAdmin);

// --- PROTECTED ROUTES (Harus Login) ---
// PENTING: Semua route di bawah baris ini akan dicek tokennya
router.use(verifyToken);

// Dashboard Overview
router.get("/dashboard/stats", getDashboardStats);
router.get("/dashboard/chart", getChartData);

// 1. Cek Session User
router.get("/auth/me", getMe);

// 2. User Management (CRUD)
// GET: Boleh diakses siapa saja yang sudah login (misal CS mau lihat list)
router.get("/admins", getAllAdmins);

// CUD: Hanya SUPER_ADMIN yang boleh Create, Update, Delete
router.post("/admins", restrictTo("SUPER_ADMIN"), createAdmin);
router.put("/admins/:id", restrictTo("SUPER_ADMIN"), updateAdmin);
router.delete("/admins/:id", restrictTo("SUPER_ADMIN"), deleteAdmin);

// === MANAJEMEN KURIR ===
// GET: Semua Admin boleh lihat list & status
router.get("/couriers", getAllCouriers);

// CREATE: Semua Admin boleh daftarkan nomor HP baru (agar bot kenal)
router.post("/couriers", createCourier);

// UPDATE: Semua Admin boleh update shift/nama
router.put("/couriers/:id", updateCourier);

// DELETE: HANYA SUPER_ADMIN yang boleh hapus data kurir
router.delete("/couriers/:id", deleteCourier);

export default router;
