import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { connectRedis, redisClient } from "./src/config/redisClient.js";
import { connectDB, sequelize } from "./src/config/database.js";
// import "./src/models/index.js";

import globalErrorHandler from "./src/middleware/errorMiddleware.js";
import AppError from "./src/utils/AppError.js";
import logger from "./src/utils/logger.js";

import webhookRoutes from "./src/routes/webhookRoutes.js";
import apiRoutes from "./src/routes/apiRoutes.js";

// Load environment variables
dotenv.config();

const app = express();
// BUNGKUS EXPRESS DENGAN HTTP SERVER
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// --- SETUP SOCKET.IO ---
const io = new Server(server, {
  cors: {
    // Izinkan origin frontend (Vite biasanya port 5173)
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
  // Izinkan transport polling dan websocket
  transports: ["websocket", "polling"],
});

// EVENT LISTENER SOCKET
io.on("connection", (socket) => {
  logger.info(`✅ Client connected to socket io: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`❌ Client disconnected: ${socket.id}`);
  });
});

// TANGANI ERROR SOCKET (Agar tidak crash saat Frontend refresh)
io.engine.on("connection_error", (err) => {
  // Kode error 0-5 biasanya gangguan koneksi biasa saat dev (ignore saja)
  const isDevNoise = err.code < 5;
  if (!isDevNoise) {
    logger.error(`Socket Connection Error: ${err.message}`);
  }
});

// MIDDLEWARES
app.use(helmet());
app.use(cors());

// --- FIX LOGGER (MORGAN) ---
// Masalah log "::1" atau error parsing terjadi karena request Socket.io ikut tercatat.
// Kita SKIP request yang url-nya mengandung "/socket.io"
app.use(
  morgan(
    (tokens, req, res) => {
      // 1. SKIP LOG SOCKET.IO agar terminal bersih
      if (req.url.includes("/socket.io")) return null;

      // 2. Return JSON String
      return JSON.stringify({
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: tokens.status(req, res),
        responseTime: tokens["response-time"](req, res) + " ms",
      });
    },
    {
      stream: {
        write: (message) => {
          try {
            // Parse JSON string dari Morgan
            const logData = JSON.parse(message);

            // --- LOGIC PEMISAH LOG (INFO vs ERROR) ---
            const statusCode = parseInt(logData.status) || 200;

            if (statusCode >= 500) {
              // Server Error -> Masuk error.log & combined.log
              logger.error(JSON.stringify(logData));
            } else if (statusCode >= 400) {
              // Client Error (404, 400) -> Masuk warn (atau error.log tergantung config winston)
              logger.warn(JSON.stringify(logData));
            } else {
              // Sukses (200) -> Masuk combined.log saja
              logger.info(JSON.stringify(logData));
            }
          } catch (e) {
            // Fallback jika gagal parse
            logger.info(message.trim());
          }
        },
      },
    }
  )
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// INJECT IO KE REQUEST
app.use((req, res, next) => {
  req.io = io;
  next();
});

// DATABASE CONNECTION
connectDB();

// REDIS
(async () => {
  await connectRedis();
})();

// ROUTES
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "MyJek API Service is Running 🚀",
  });
});

app.use("/api/webhook", webhookRoutes);
app.use("/api", apiRoutes);

// 404 HANDLER
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// GLOBAL ERROR HANDLER
app.use(globalErrorHandler);

// START SERVER
server.listen(PORT, () => {
  // logger.info(`🚀 Server running on port ${PORT}`);
  console.log(`\n========================================`);
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🤖 AI PROVIDER: ${process.env.AI_PROVIDER}`);
  console.log(`🔗 WAHA URL: ${process.env.WAHA_API_URL}`);
  console.log(`========================================\n`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    try {
      await redisClient.quit();
      await sequelize.close();

      console.log("Shutdown complete.");
      process.exit(0);
    } catch (err) {
      console.error("Shutdown error:", err);
      process.exit(1);
    }
  });

  // Force shutdown jika hang
  setTimeout(() => {
    console.error("Force shutdown.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Tidak perlu export default app jika server.listen sudah dijalankan di sini
// Tapi jika dibutuhkan untuk testing, export server-nya
export default server;
