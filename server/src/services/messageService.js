import axios from "axios";
import dotenv from "dotenv";
import { storageService } from "./storageService.js";

dotenv.config();

// WAHA_URL harus mengarah ke container WAHA (misal: http://waha:3000 atau http://localhost:7575 jika host mode)
const WAHA_URL = process.env.WAHA_API_URL || "http://localhost:7575";
const WAHA_SESSION = process.env.WAHA_SESSION || "default";
const WAHA_KEY = process.env.WAHA_API_KEY || "";

const apiClient = axios.create({
  baseURL: WAHA_URL,
  timeout: 15000, // Timeout 15 detik
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
    ...(WAHA_KEY ? { "X-Api-Key": WAHA_KEY } : {}),
  },
});

/** Format nomor ke chatId WAHA. Jika sudah berisi @ (mis. @c.us, @lid), kembalikan apa adanya. */
const formatToWhatsAppId = (number) => {
  if (!number) return null;
  const s = number.toString().trim();
  if (s.includes("@")) return s;
  let cleaned = s.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("08")) cleaned = "62" + cleaned.slice(1);
  else if (cleaned.startsWith("8")) cleaned = "62" + cleaned;
  if (!cleaned.endsWith("@c.us")) cleaned += "@c.us";
  return cleaned;
};

/**
 * Resolve LID (Linked ID, mis. 254...@lid) ke nomor HP via API WAHA.
 * GET /api/{session}/lids/{lid} → { pn: "628xxx@c.us" }
 * @param {string} lidOrJid - payload.from (mis. "254386768994458@lid") atau hanya "254386768994458"
 * @returns {Promise<string|null>} - nomor 62xxx atau null
 */
export async function getPhoneByLid(lidOrJid) {
  if (!lidOrJid || typeof lidOrJid !== "string") return null;
  const lidPart = lidOrJid.trim().split("@")[0];
  if (!lidPart || !/^\d+$/.test(lidPart)) return null;
  try {
    const session = encodeURIComponent(WAHA_SESSION);
    const lidEnc = encodeURIComponent(lidPart);
    const { data } = await apiClient.get(`/api/${session}/lids/${lidEnc}`);
    const pn = data?.pn;
    if (!pn || typeof pn !== "string") return null;
    const beforeAt = pn.split("@")[0];
    const digits = (beforeAt || "").replace(/[^0-9]/g, "");
    if (!digits || digits.length < 10) return null;
    let normalized = digits;
    if (normalized.startsWith("08")) normalized = "62" + normalized.slice(1);
    else if (normalized.startsWith("8")) normalized = "62" + normalized;
    return normalized.startsWith("62") ? normalized : null;
  } catch (err) {
    return null;
  }
}

export const messageService = {
  // KIRIM TEXT
  async sendMessage(to, text) {
    try {
      const chatId = formatToWhatsAppId(to);
      await apiClient.post("/api/sendText", {
        session: WAHA_SESSION,
        chatId,
        text,
      });
      return true;
    } catch (error) {
      console.error(`❌ Gagal Kirim Text: ${error.message}`);
      return false;
    }
  },

  // KIRIM GAMBAR
  async sendImage(to, imageSource, caption = "") {
    try {
      const chatId = formatToWhatsAppId(to);
      console.log(`​​​​​📷 Memproses kirim gambar ke ${chatId}`);

      let base64Content = null;

      // Input sudah Base64 (Data URI)
      if (imageSource && imageSource.startsWith("data:")) {
        // Ambil bagian datanya saja (setelah koma)
        base64Content = imageSource.split(",")[1];
      }

      // Input berupa Nama File MinIO (download dulu)
      else if (imageSource && !imageSource.startsWith("http")) {
        console.log(`☁️ Downloading buffer from MinIO: ${imageSource}`);
        const fileBuffer = await storageService.getFileBuffer(imageSource);

        if (fileBuffer) {
          // Convert Buffer ke Base64 String
          base64Content = fileBuffer.toString("base64");
        } else {
          throw new Error("File tidak ditemukan di MinIO.");
        }
      }

      // Input URL HTTP (Opsional)
      if (!base64Content) {
        throw new Error("Gagal memproses data gambar.");
      }

      // KIRIM KE WAHA
      // Gunakan endpoint /api/sendFile
      // Untuk versi GRATIS, wajib kirim datanya langsung di field 'file.data'
      const payload = {
        session: WAHA_SESSION,
        chatId: chatId,
        caption: caption,
        file: {
          filename: "invoice.jpg",
          mimetype: "image/jpeg",
          data: base64Content,
        },
      };

      await apiClient.post("/api/sendFile", payload);
      console.log(`✅ Gambar berhasil dikirim ke ${chatId}`);
      return true;
    } catch (error) {
      console.error(
        `Gagal Kirim Gambar ke ${to}:`,
        error.response ? error.response.data : error.message
      );

      // Fallback
      await this.sendMessage(to, `${caption}\n\n_(Gambar gagal dimuat, mohon maaf)_.`);
      return false;
    }
  },

  // KIRIM LOKASI (WAHA: POST /api/sendLocation)
  async sendLocation(to, latitude, longitude, title = "Lokasi") {
    try {
      const chatId = formatToWhatsAppId(to);
      if (!chatId) return false;
      await apiClient.post("/api/sendLocation", {
        session: WAHA_SESSION,
        chatId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        title: String(title),
      });
      return true;
    } catch (error) {
      console.error(`❌ Gagal Kirim Lokasi: ${error.message}`);
      return false;
    }
  },
};
