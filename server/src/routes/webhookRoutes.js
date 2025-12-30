import express from "express";
import * as webhookController from "../controllers/webhookController.js";
import { setSessionMode } from "../controllers/adminController.js";

const router = express.Router();

// ==================================================================
// DEFINISI RUTE WEBHOOK
// Base Path (nanti di app.js) akan kita set: /webhook
// Jadi URL lengkapnya: POST /webhook/waha
// ==================================================================

// Middleware khusus route ini (opsional, misal validasi IP WAHA)
// router.use(verifyWahaSignature);

// Endpoint utama menerima pesan
router.post("/whatsapp", webhookController.handleIncomingMessage);

// Private Admin API (Nanti bisa diproteksi dengan API Key)
// Endpoint ini yang dipanggil oleh N8N / Admin Dashboard
router.post("/admin/session", setSessionMode);

// Endpoint untuk test status (Health Check khusus webhook)
router.get("/health", (req, res) => {
  res.status(200).json({ status: "Webhook Service Ready" });
});

export default router;
