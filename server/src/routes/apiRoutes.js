// src/routes/apiRoutes.js
import express from "express";
import { loginAdmin, getMe, updateProfile, updatePassword } from "../controllers/authController.js";
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
import { getAllOrders, getOrderById } from "../controllers/orderController.js";
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
} from "../controllers/notificationController.js";
import {
  getActiveSessions,
  getChatHistory,
  sendMessageToUser,
  toggleSessionMode,
} from "../controllers/interventionController.js";
import {
  exportTransactionReport,
  getReportSummary,
  getRevenueChart,
  getTransactionReports,
} from "../controllers/reportController.js";

const router = express.Router();

// PUBLIC ROUTES
router.post("/auth/login", loginAdmin);

// PROTECTED ROUTES (Harus Login)
// Semua route di bawah baris ini akan dicek tokennya
router.use(verifyToken);

// Dashboard Overview
router.get("/dashboard/stats", getDashboardStats);
router.get("/dashboard/chart", getChartData);

// Orders Monitor
router.get("/orders", getAllOrders);
router.get("/orders/:id", getOrderById);

// INTERVENTION ROUTES
router.get("/intervention/sessions", getActiveSessions);
router.get("/intervention/history/:phone", getChatHistory);
router.post("/intervention/send", sendMessageToUser);
router.post("/intervention/toggle-mode", toggleSessionMode);

// NOTIFICATION ROUTES
router.get("/notifications", getNotifications);
router.patch("/notifications/read-all", markAllAsRead);
router.patch("/notifications/:id/read", markAsRead);

// REPORT & ANALYTICS ROUTES
router.get("/reports/summary", getReportSummary);
router.get("/reports/chart", getRevenueChart);
router.get("/reports/transactions", getTransactionReports);
router.get("/reports/export/excel", exportTransactionReport);

// Cek Session User
router.get("/auth/me", getMe);
router.patch("/auth/profile", updateProfile);
router.patch("/auth/password", updatePassword);

// User Management (CRUD)
router.get("/admins", restrictTo("SUPER_ADMIN"), getAllAdmins);
router.post("/admins", restrictTo("SUPER_ADMIN"), createAdmin);
router.put("/admins/:id", restrictTo("SUPER_ADMIN"), updateAdmin);
router.delete("/admins/:id", restrictTo("SUPER_ADMIN"), deleteAdmin);

// MANAJEMEN KURIR
// Semua Admin boleh lihat list & status
router.get("/couriers", getAllCouriers);
router.post("/couriers", createCourier);
router.put("/couriers/:id", updateCourier);
router.delete("/couriers/:id", deleteCourier);

export default router;
