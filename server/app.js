import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { connectRedis } from "./src/config/redisClient.js";
import { connectDB } from "./src/config/database.js";
// import "./src/models/index.js";

import globalErrorHandler from "./src/middleware/errorMiddleware.js";
import AppError from "./src/utils/AppError.js";
import logger from "./src/utils/logger.js";

import webhookRoutes from "./src/routes/webhookRoutes.js";
import apiRoutes from "./src/routes/apiRoutes.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// SECURITY & UTILITY MIDDLEWARE
app.use(helmet()); // Menambahkan HTTP Headers keamanan
app.use(cors()); // Mengizinkan akses dari Frontend (beda domain/port)

// Custom Morgan untuk connect ke Winston Logger (File Log)
const morganFormat = ":method :url :status :response-time ms - :res[content-length]";
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => {
        const logObject = {
          method: message.split(" ")[0],
          url: message.split(" ")[1],
          status: message.split(" ")[2],
          responseTime: message.split(" ")[3],
        };
        logger.info(JSON.stringify(logObject));
      },
    },
  })
);

// BODY PARSING
// Limit body size agar server tidak crash jika dikirim file gambar base64 besar
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// DATABASE CONNECTION
connectDB();

// REDIS
(async () => {
  await connectRedis();
})();

// ROUTE CHECK
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "MyJek API Service is Secure & Running 🚀",
    environment: process.env.NODE_ENV,
    ai_provider: process.env.AI_PROVIDER,
  });
});

// APP ROUTES
app.use("/api/webhook", webhookRoutes);
app.use("/api", apiRoutes);

// Handle 404 (Route Not Found)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// GLOBAL ERROR HANDLER
app.use(globalErrorHandler);

// START SERVER
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🤖 AI PROVIDER: ${process.env.AI_PROVIDER}`);
  console.log(`🔗 WAHA URL: ${process.env.WAHA_API_URL}`);
  console.log(`========================================\n`);
});

export default app;
