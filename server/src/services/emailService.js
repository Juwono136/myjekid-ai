import nodemailer from "nodemailer";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config();

// Konfigurasi Transporter (SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // Email pengirim
    pass: process.env.SMTP_PASS, // App Password (jika pakai Gmail)
  },
});

export const sendEmailNotification = async (to, subject, htmlContent) => {
  try {
    // Jika kredensial belum diset, skip saja agar tidak error di development
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.warn("SMTP credentials not found. Email notification skipped.");
      return;
    }

    const info = await transporter.sendMail({
      from: `"MyJek Support Team" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
    });

    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Failed to send email: ${error.message}`);
  }
};
