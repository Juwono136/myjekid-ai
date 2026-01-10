import axios from "axios";
import { ChatSession, User, TrainingData } from "../models/index.js";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
import { Op } from "sequelize";
import { createSystemNotification } from "./notificationController.js";

dotenv.config();

// --- KONFIGURASI WAHA ---
const WAHA_URL = process.env.WAHA_API_URL || "http://localhost:7575";
const WAHA_KEY = process.env.WAHA_API_KEY || "";

const wahaClient = axios.create({
  baseURL: WAHA_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
    ...(WAHA_KEY ? { "X-Api-Key": WAHA_KEY } : {}),
  },
});

/**
 * 1. KIRIM PESAN DARI ADMIN KE USER
 */
export const sendMessageToUser = async (req, res, next) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ status: "error", message: "Phone dan Message wajib diisi." });
    }

    const session = await ChatSession.findOne({ where: { phone } });
    if (!session) throw new Error("Sesi chat tidak ditemukan.");

    const chatId = phone.endsWith("@c.us") ? phone : `${phone}@c.us`;
    await wahaClient.post("/api/sendText", {
      session: "default",
      chatId: chatId,
      text: message,
    });

    if (session.mode === "HUMAN") {
      await TrainingData.create({
        user_question: "",
        admin_answer: message,
        category: "HUMAN_INTERVENTION",
        source: `ADMIN_TO_${phone}`,
      });
    }

    if (req.io) {
      req.io.emit("intervention-message", {
        phone: phone.replace("@c.us", ""),
        text: message,
        sender: "ADMIN",
        timestamp: new Date(),
        mode: session.mode,
      });
    }

    res.status(200).json({ status: "success", message: "Pesan terkirim." });
  } catch (error) {
    logger.error(`Gagal kirim pesan admin: ${error.message}`);
    next(error);
  }
};

/**
 * 2. TOGGLE MODE (BOT <-> HUMAN)
 * [FIXED] Sekarang mentrigger Notifikasi & Email
 */
export const toggleSessionMode = async (req, res, next) => {
  try {
    const { phone, mode } = req.body;

    if (!["HUMAN", "BOT"].includes(mode)) {
      return res.status(400).json({ message: "Mode harus 'HUMAN' atau 'BOT'" });
    }

    // Include User untuk mendapatkan Nama User (keperluan Email Template)
    let session = await ChatSession.findOne({
      where: { phone },
      include: [{ model: User, attributes: ["name"] }],
    });

    if (!session) return res.status(404).json({ message: "Sesi tidak ditemukan" });

    let updateData = { mode };

    // LOGIKA SAFETY NET
    if (mode === "HUMAN") {
      const pauseDuration = 30 * 60 * 1000; // 30 Menit
      updateData.is_paused_until = new Date(Date.now() + pauseDuration);
    } else {
      updateData.is_paused_until = null;
    }

    await session.update(updateData);

    // 1. Emit Socket Chat UI (Agar tombol toggle berubah)
    if (req.io) {
      req.io.emit("intervention-message", {
        phone: phone,
        sender: "SYSTEM",
        text:
          mode === "HUMAN" ? "🔒 Admin mengambil alih (Mode Human)" : "🤖 Bot diaktifkan kembali",
        timestamp: new Date(),
        mode: mode,
        is_paused_until: updateData.is_paused_until,
      });

      // 2. [FIX] TRIGGER NOTIFIKASI SYSTEM & EMAIL (Hanya jika masuk mode HUMAN)
      if (mode === "HUMAN") {
        const userName = session.user?.name || "User Tanpa Nama";

        await createSystemNotification(req.io, {
          title: "Mode Human Diaktifkan Manual",
          message: `Admin telah mengubah mode chat untuk user ${userName} (${phone}) menjadi HUMAN.`,
          type: "HUMAN_HANDOFF", // Tipe ini akan memicu pengiriman Email di notificationController
          referenceId: phone,
          actionUrl: `/dashboard/chat`,
          extraData: { userName: userName },
        }).catch((err) => logger.error(`Gagal kirim notifikasi toggle: ${err.message}`));
      }
    }

    res.json({ status: "success", data: updateData });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. AMBIL DAFTAR USER AKTIF
 * (Versi yang sudah diperbaiki filternya agar data muncul)
 */
export const getActiveSessions = async (req, res, next) => {
  try {
    const { search = "" } = req.query;

    // Filter Longgar: Tampilkan semua sesi
    const whereClause = {};

    const includeUser = {
      model: User,
      attributes: ["name"],
    };

    if (search) {
      includeUser.where = {
        name: { [Op.iLike]: `%${search}%` },
      };

      if (!isNaN(search)) {
        whereClause.phone = { [Op.like]: `%${search}%` };
        delete includeUser.where;
      }
    }

    const sessions = await ChatSession.findAll({
      where: whereClause,
      include: [includeUser],
      order: [
        ["mode", "DESC"],
        ["last_interaction", "DESC"],
      ],
      limit: 50,
    });

    const data = sessions.map((s) => ({
      id: s.id,
      phone: s.phone,
      user_name: s.user?.name || "Tanpa Nama",
      mode: s.mode,
      last_interaction: s.last_interaction,
      unreadCount: 0,
    }));

    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. AMBIL HISTORY CHAT
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const { phone } = req.params;
    const { limit = 50 } = req.query;
    const chatId = phone.endsWith("@c.us") ? phone : `${phone}@c.us`;

    const response = await wahaClient.get("/api/messages", {
      params: {
        chatId: chatId,
        limit: limit,
        downloadMedia: false,
      },
    });

    const formattedMessages = response.data
      .map((msg) => ({
        id: msg.id,
        text: msg.body,
        sender: msg.fromMe ? "ADMIN" : "USER",
        timestamp: msg.timestamp * 1000,
        status: msg.ack,
      }))
      .reverse();

    res.status(200).json({ status: "success", data: formattedMessages });
  } catch (error) {
    res.status(200).json({ status: "success", data: [] });
  }
};
