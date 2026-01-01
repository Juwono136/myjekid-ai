import logger from "../utils/logger.js";

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Log Error ke File
  logger.error(
    `${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`
  );

  // Response ke Client
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    // Stack trace hanya ditampilkan di mode dev agar aman
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

export default globalErrorHandler;
