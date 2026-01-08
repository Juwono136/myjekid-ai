import axios from "axios";
import { ChatSession, User, TrainingData } from "../models/index.js";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
import { Op } from "sequelize";

dotenv.config();

// --- KONFIGURASI WAHA ---
const WAHA_URL = process.env.WAHA_API_URL || "http://localhost:7575";
const WAHA_KEY = process.env.WAHA_API_KEY || ""; // Ambil API Key dari .env

// Setup Axios Client untuk WAHA
const wahaClient = axios.create({
  baseURL: WAHA_URL,
  timeout: 15000, // Timeout 15 detik
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
    ...(WAHA_KEY ? { "X-Api-Key": WAHA_KEY } : {}), // Header API Key Dinamis
  },
});

/**
 * 1. KIRIM PESAN DARI ADMIN KE USER
 * [UPDATE]: Tidak lagi mengubah mode secara otomatis.
 * Mode harus diubah via endpoint toggleSessionMode.
 */
export const sendMessageToUser = async (req, res, next) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ status: "error", message: "Phone dan Message wajib diisi." });
    }

    // A. Validasi Sesi (Hanya cek keberadaan)
    const session = await ChatSession.findOne({ where: { phone } });
    if (!session) throw new Error("Sesi chat tidak ditemukan.");

    // B. Kirim ke WAHA
    const chatId = phone.endsWith("@c.us") ? phone : `${phone}@c.us`;
    await wahaClient.post("/api/sendText", {
      session: "default",
      chatId: chatId,
      text: message,
    });

    // C. Simpan Log (Tanpa mengubah mode)
    if (session.mode === "HUMAN") {
      await TrainingData.create({
        user_question: "", // Kosong karena ini inisiatif/balasan admin
        admin_answer: message,
        category: "HUMAN_INTERVENTION",
        source: `ADMIN_TO_${phone}`,
      });
    }

    // D. Emit Socket (Agar chat bubble muncul di UI Admin)
    if (req.io) {
      req.io.emit("intervention-message", {
        phone: phone.replace("@c.us", ""),
        text: message,
        sender: "ADMIN",
        timestamp: new Date(),
        // Kita kirim mode saat ini, tidak memaksa 'HUMAN'
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
 * [BARU] 2. TOGGLE MODE (BOT <-> HUMAN)
 * Endpoint: POST /api/intervention/toggle-mode
 * Body: { phone: "628xxx", mode: "HUMAN" | "BOT" }
 */
export const toggleSessionMode = async (req, res, next) => {
  try {
    const { phone, mode } = req.body;

    if (!["HUMAN", "BOT"].includes(mode)) {
      return res.status(400).json({ message: "Mode harus 'HUMAN' atau 'BOT'" });
    }

    let session = await ChatSession.findOne({ where: { phone } });
    if (!session) return res.status(404).json({ message: "Sesi tidak ditemukan" });

    let updateData = { mode };

    // LOGIKA SAFETY NET (is_paused_until)
    if (mode === "HUMAN") {
      // Jika masuk mode HUMAN, pause bot selama 30 menit (misalnya)
      // Jadi jika admin lupa balikin ke BOT, setelah 30 menit bot bangun sendiri.
      const pauseDuration = 30 * 60 * 1000; // 30 Menit
      updateData.is_paused_until = new Date(Date.now() + pauseDuration);
    } else {
      // Jika kembali ke BOT, hapus pause
      updateData.is_paused_until = null;
    }

    await session.update(updateData);

    // Emit Socket Perubahan Mode (Agar Frontend UI berubah real-time)
    if (req.io) {
      req.io.emit("intervention-message", {
        phone: phone,
        sender: "SYSTEM", // System notification
        text:
          mode === "HUMAN" ? "🔒 Admin mengambil alih (Mode Human)" : "🤖 Bot diaktifkan kembali",
        timestamp: new Date(),
        mode: mode,
        is_paused_until: updateData.is_paused_until,
      });
    }

    res.json({ status: "success", data: updateData });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. AMBIL DAFTAR USER AKTIF (Sidebar Dashboard)
 * Endpoint: GET /api/intervention/sessions
 */
export const getActiveSessions = async (req, res, next) => {
  try {
    const { search = "" } = req.query;

    const whereClause = {
      // Kita ambil sesi yang HUMAN mode atau baru aktif 24 jam terakhir agar list tidak kosong
      [Op.or]: [
        { mode: "HUMAN" },
        {
          last_interaction: {
            [Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000), // Aktif 24 jam terakhir
          },
        },
      ],
    };

    // Include User untuk searching by name
    const includeUser = {
      model: User,
      attributes: ["name"],
    };

    if (search) {
      // Jika ada search, filter berdasarkan no HP atau Nama User
      includeUser.where = {
        [Op.or]: [{ name: { [Op.iLike]: `%${search}%` } }, { phone: { [Op.like]: `%${search}%` } }],
      };
      // Hapus whereClause utama session jika search spesifik ke user
      delete whereClause[Op.or];
    }

    const sessions = await ChatSession.findAll({
      where: whereClause,
      include: [includeUser],
      order: [
        ["mode", "DESC"], // Prioritaskan yang mode HUMAN (Z-A)
        ["last_interaction", "DESC"], // Lalu yang paling baru interaksinya
      ],
      limit: 50, // Batasi 50 sesi terbaru agar ringan
    });

    // Mapping data agar rapi di frontend
    const data = sessions.map((s) => ({
      id: s.id,
      phone: s.phone,
      user_name: s.user?.name || "Tanpa Nama", // Fallback jika user dihapus tapi sesi ada
      mode: s.mode,
      last_interaction: s.last_interaction,
      // Tips: Untuk 'unread count', idealnya butuh tabel message terpisah.
      // Saat ini kita pakai 0 dulu atau logic notifikasi di frontend.
      unreadCount: 0,
    }));

    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. AMBIL HISTORY CHAT (PROFESIONAL: VIA WAHA)
 * Endpoint: GET /api/intervention/history/:phone
 * * Penjelasan: Menggunakan WAHA History lebih disarankan untuk 'Live Chat View'
 * karena urutan timestamp terjamin dan mendukung media/status.
 * Data di TrainingData tetap disimpan untuk keperluan fine-tuning AI nanti.
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const { phone } = req.params;
    const { limit = 50 } = req.query; // Ambil 50 chat terakhir
    const chatId = phone.endsWith("@c.us") ? phone : `${phone}@c.us`;

    // Panggil WAHA getMessages
    const response = await wahaClient.get("/api/messages", {
      params: {
        chatId: chatId,
        limit: limit,
        downloadMedia: false,
      },
    });

    // Format pesan agar sesuai dengan Frontend ChatWindow
    // WAHA mengembalikan array terbalik (terbaru dulu), kita reverse agar (terlama -> terbaru)
    const formattedMessages = response.data
      .map((msg) => ({
        id: msg.id,
        text: msg.body,
        sender: msg.fromMe ? "ADMIN" : "USER",
        timestamp: msg.timestamp * 1000, // WAHA pakai unix timestamp (seconds), JS butuh ms
        status: msg.ack, // 1=sent, 2=received, 3=read (opsional untuk UI)
      }))
      .reverse();

    res.status(200).json({ status: "success", data: formattedMessages });
  } catch (error) {
    // Jika Gagal Fetch WAHA (Misal fitur history mati), return array kosong
    // logger.warn(`Gagal fetch history WAHA: ${error.message}`);
    res.status(200).json({ status: "success", data: [] });
  }
};
