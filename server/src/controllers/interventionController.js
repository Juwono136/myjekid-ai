import axios from "axios";
import { Op } from "sequelize";
import dotenv from "dotenv";
import logger from "../utils/logger.js";
import { ChatSession, User, TrainingData } from "../models/index.js";
import { createSystemNotification } from "./notificationController.js";

dotenv.config();

// KONFIGURASI WAHA
const WAHA_URL = process.env.WAHA_API_URL || "http://localhost:7575";
const WAHA_KEY = process.env.WAHA_API_KEY || "";
const WAHA_PUBLIC_URL = process.env.WAHA_PUBLIC_URL || WAHA_URL;

const wahaClient = axios.create({
  baseURL: WAHA_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
    ...(WAHA_KEY ? { "X-Api-Key": WAHA_KEY } : {}),
  },
});

const applyNoCache = (res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
};

/** URL media untuk client: jika bukan data URL, pakai proxy agar gambar bisa di-load (hindari CORS). */
function toClientMediaUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;
  const raw = mediaUrl.trim();
  if (raw.startsWith("data:")) return raw;
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return null;
  return `/api/intervention/media-proxy?u=${encodeURIComponent(normalized)}`;
}

// Kirim pesan dari admin ke user
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
    logger.error(`Failed to send admin message: ${error.message}`);
    next(error);
  }
};

// Toogle mode (HUMAN <-> BOT)
export const toggleSessionMode = async (req, res, next) => {
  try {
    let { phone, mode } = req.body;
    phone = typeof phone === "string" ? phone.trim() : "";

    if (!phone) {
      return res.status(400).json({ message: "Nomor telepon wajib." });
    }
    if (!["HUMAN", "BOT"].includes(mode)) {
      return res.status(400).json({ message: "Mode harus 'HUMAN' atau 'BOT'" });
    }

    // Include User untuk mendapatkan Nama User
    let session = await ChatSession.findOne({
      where: { phone },
      include: [{ model: User, attributes: ["name"] }],
    });

    if (!session) return res.status(404).json({ message: "Sesi tidak ditemukan" });

    const updateData = { mode, is_paused_until: null };
    if (mode === "HUMAN") {
      updateData.human_since = new Date();
    } else {
      updateData.human_since = null;
    }

    try {
      await session.update(updateData);
    } catch (err) {
      if (err.name === "SequelizeDatabaseError" && err.message?.includes("human_since")) {
        await session.update({ mode: updateData.mode, is_paused_until: null });
      } else {
        throw err;
      }
    }

    if (req.io) {
      req.io.emit("intervention-message", {
        phone: phone,
        sender: "SYSTEM",
        text: mode === "HUMAN" ? "Admin mengambil alih (Mode Human)" : "Bot diaktifkan kembali",
        timestamp: new Date(),
        mode: mode,
        is_paused_until: updateData.is_paused_until,
      });

      // TRIGGER NOTIFIKASI SYSTEM & EMAIL (Hanya jika masuk mode HUMAN)
      if (mode === "HUMAN") {
        const userName = session.user?.name || "User Tanpa Nama";

        await createSystemNotification(req.io, {
          title: "Mode Human diaktifkan",
          message: `${userName} (${phone}) — silakan balas dari dashboard.`,
          type: "HUMAN_HANDOFF",
          referenceId: phone,
          actionUrl: `/dashboard/chat`,
          extraData: { userName: userName },
        }).catch((err) => logger.error(`Failed to send notification toggle: ${err.message}`));
      }
    }

    res.json({ status: "success", data: updateData });
  } catch (error) {
    next(error);
  }
};

// Ambil daftar user aktif
export const getActiveSessions = async (req, res, next) => {
  try {
    applyNoCache(res);
    const { search = "" } = req.query;

    // Tampilkan semua sesi
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

/** Normalisasi URL media: jika relative, jadikan absolut dengan WAHA base. */
function normalizeMediaUrl(url) {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();
  if (t.startsWith("data:")) return t;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("/")) return new URL(t, WAHA_URL).href;
  return new URL(t, WAHA_URL).href;
}

/** Ambil URL media atau data URL untuk satu pesan via GET message by id (WAHA). */
async function fetchMediaUrlForMessage(session, chatId, messageId) {
  if (!messageId) return null;
  try {
    const path = `/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`;
    const res = await wahaClient.get(path, { params: { downloadMedia: true }, timeout: 10000 });
    const m = res.data?.message ?? res.data;
    const d = m?._data || {};
    const mediaObj = m?.media ?? d?.media;
    const base64 = mediaObj?.data ?? mediaObj?.base64 ?? d?.data;
    if (base64 && typeof base64 === "string") {
      const mime = mediaObj?.mimetype || "image/jpeg";
      return `data:${mime};base64,${base64}`;
    }
    const url =
      m?.media?.url ||
      m?.mediaUrl ||
      m?.media_url ||
      d.media?.url ||
      d.mediaUrl ||
      d.downloadUrl ||
      (typeof m?.media === "string" ? m.media : null);
    return normalizeMediaUrl(url) || null;
  } catch (e) {
    logger.warn(`getChatHistory: fetch media for message ${messageId}: ${e.message}`);
    return null;
  }
}

// Ambil history chat — WAHA: GET /api/{session}/chats/{chatId}/messages
export const getChatHistory = async (req, res, next) => {
  try {
    applyNoCache(res);
    const { phone } = req.params;
    const { limit = 50 } = req.query;
    const chatId = phone.endsWith("@c.us") ? phone : `${phone}@c.us`;
    const session = "default";

    let rawMessages = [];
    try {
      const path = `/api/${session}/chats/${encodeURIComponent(chatId)}/messages`;
      const response = await wahaClient.get(path, {
        params: { limit: Math.min(Number(limit) || 50, 100), downloadMedia: true },
      });
      const data = response.data;
      rawMessages = Array.isArray(data) ? data : (data?.messages ?? data?.data ?? []);
    } catch (pathErr) {
      const fallback = await wahaClient.get("/api/messages", {
        params: { session, chatId, limit: limit || 50, downloadMedia: true },
      });
      const data = fallback.data;
      rawMessages = Array.isArray(data) ? data : (data?.messages ?? data?.data ?? []);
    }

    // Untuk pesan yang hasMedia tapi belum punya URL, ambil per message by id (biasanya gambar)
    const needMediaIds = rawMessages
      .filter((msg) => {
        const d = msg._data || {};
        const hasMedia = msg.hasMedia || d.hasMedia;
        const hasUrl =
          msg.media?.url ||
          msg.mediaUrl ||
          msg.media_url ||
          d.media?.url ||
          d.mediaUrl ||
          d.downloadUrl ||
          (typeof msg.media === "string" ? msg.media : false);
        return hasMedia && !hasUrl && msg.id;
      })
      .map((m) => m.id)
      .slice(0, 15);
    const mediaUrlById = {};
    if (needMediaIds.length > 0) {
      const results = await Promise.all(
        needMediaIds.map((id) => fetchMediaUrlForMessage(session, chatId, id).then((url) => ({ id, url })))
      );
      results.forEach(({ id, url }) => {
        if (url) mediaUrlById[id] = url;
      });
    }

    const formattedMessages = rawMessages
      .map((msg) => {
        const ts = msg.timestamp ? (typeof msg.timestamp === "number" ? msg.timestamp * 1000 : new Date(msg.timestamp).getTime()) : Date.now();
        const d = msg._data || {};
        const mediaUrl =
          msg.media?.url ||
          msg.mediaUrl ||
          msg.media_url ||
          d.media?.url ||
          d.mediaUrl ||
          d.downloadUrl ||
          (typeof msg.media === "string" ? msg.media : null) ||
          mediaUrlById[msg.id] ||
          null;
        let type = (msg.type || msg.messageType || msg.message?.type || d.type || "chat").toLowerCase();
        if (type === "ptt") type = "audio";
        if (type === "loc") type = "location";
        if ((msg.hasMedia || d.hasMedia) && !mediaUrl && type === "chat") type = "image";
        if ((msg.hasMedia || d.hasMedia) && mediaUrl && type === "chat") type = "image";
        const body = msg.body ?? msg.text ?? msg.message?.body ?? (typeof msg.content === "string" ? msg.content : "") ?? "";
        const lat = msg.latitude ?? msg.location?.latitude ?? msg.message?.location?.latitude ?? d.latitude;
        const lng = msg.longitude ?? msg.location?.longitude ?? msg.message?.location?.longitude ?? d.longitude;
        return {
          id: msg.id,
          text: typeof body === "string" ? body : "",
          sender: msg.fromMe ? "BOT" : "USER",
          timestamp: ts,
          status: msg.ack,
          type,
          media_url: toClientMediaUrl(mediaUrl || mediaUrlById[msg.id] || null),
          latitude: lat != null ? Number(lat) : null,
          longitude: lng != null ? Number(lng) : null,
        };
      })
      .reverse();

    res.status(200).json({ status: "success", data: formattedMessages });
  } catch (error) {
    const wahaError = error.response?.data
      ? JSON.stringify(error.response.data)
      : "no-response-body";
    logger.error(`Failed to fetch chat history: ${error.message} | ${wahaError}`);
    res.status(502).json({
      status: "error",
      message: "Gagal mengambil history chat dari WhatsApp gateway.",
    });
  }
};

/** Host WAHA (dan public URL jika beda) untuk kirim X-Api-Key saat proxy media. */
function getWahaHosts() {
  const hosts = new Set();
  try {
    hosts.add(new URL(WAHA_URL).host);
  } catch {}
  try {
    hosts.add(new URL(WAHA_PUBLIC_URL).host);
  } catch {}
  return hosts;
}

/** Apakah URL menunjuk ke host WAHA (untuk kirim X-Api-Key). */
function isWahaHost(url) {
  try {
    const targetHost = new URL(url).host;
    return getWahaHosts().has(targetHost);
  } catch {
    return url.startsWith(WAHA_URL) || url.startsWith(WAHA_PUBLIC_URL);
  }
}

/** Proxy media (gambar/dll) dari WAHA ke client agar bisa di-load di browser (hindari CORS). */
export const proxyMedia = async (req, res, next) => {
  try {
    const rawUrl = req.query.u;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ status: "error", message: "Parameter u (URL) wajib." });
    }
    const targetUrl = decodeURIComponent(rawUrl.trim());
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return res.status(400).json({ status: "error", message: "URL tidak valid." });
    }
    const headers = { accept: "image/*,*/*" };
    if (isWahaHost(targetUrl) && WAHA_KEY) headers["X-Api-Key"] = WAHA_KEY;
    const axiosOpts = { responseType: "arraybuffer", timeout: 20000, headers, maxRedirects: 5, validateStatus: () => true };
    const response = await axios.get(targetUrl, axiosOpts);
    if (response.status !== 200) {
      logger.warn(`proxyMedia: WAHA returned ${response.status} for ${targetUrl.substring(0, 60)}...`);
      return res.status(502).json({ status: "error", message: "Gagal mengambil media dari server." });
    }
    const contentType = response.headers["content-type"] || "image/jpeg";
    res.set("Cache-Control", "private, max-age=3600");
    res.set("Content-Type", contentType);
    res.send(Buffer.from(response.data));
  } catch (err) {
    logger.warn(`proxyMedia: ${err.message} | url=${req.query.u?.substring(0, 80)}`);
    res.status(502).json({ status: "error", message: "Gagal mengambil media." });
  }
};
