import winston from "winston";

// Format log custom
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat
  ),
  transports: [
    // 1. Simpan Error Level ke file error.log
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    // 2. Simpan Semua Level ke file combined.log
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

// Jika sedang mode development (npm run dev), tampilkan juga di terminal console
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    })
  );
}

export default logger;
