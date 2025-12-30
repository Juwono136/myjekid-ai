import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { connectRedis } from "./src/config/redisClient.js";
import { connectDB } from "./src/config/database.js";
// import "./src/models/index.js";

import webhookRoutes from "./src/routes/webhookRoutes.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// === 1. SECURITY & UTILITY MIDDLEWARE ===
app.use(helmet()); // Menambahkan HTTP Headers keamanan
app.use(cors()); // Mengizinkan akses dari Frontend (beda domain/port)
app.use(morgan("dev")); // Logging request (GET /webhook 200 4ms - console)

// === 2. BODY PARSING ===
// Penting: Limit body size agar server tidak crash jika dikirim file gambar base64 besar
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// === 3. DATABASE CONNECTION ===
connectDB();

// === 4. ROUTE CHECK ===
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "MyJek API Service is Secure & Running 🚀",
    environment: process.env.NODE_ENV,
    ai_provider: process.env.AI_PROVIDER,
  });
});

app.use("/api/webhook", webhookRoutes);

// Menangkap error JSON yang malformed atau error server lainnya
app.use((err, req, res, next) => {
  console.error("❌ Global Error:", err.stack);
  res.status(500).json({
    status: "error",
    message: "Internal Server Error",
  });
});

(async () => {
  await connectRedis();
})();

// === 5. START SERVER ===
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🤖 AI PROVIDER: ${process.env.AI_PROVIDER}`);
  console.log(`🔗 WAHA URL: ${process.env.WAHA_API_URL}`);
  console.log(`========================================\n`);
});

export default app;
