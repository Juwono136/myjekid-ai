import axios from "axios";
import dotenv from "dotenv";
import { storageService } from "./storageService.js";

dotenv.config();

// ------------------------------------------------------------------
// KONFIGURASI PENTING
// WAHA_URL harus mengarah ke container WAHA (misal: http://waha:3000 atau http://localhost:7575 jika host mode)
// ------------------------------------------------------------------
const WAHA_URL = process.env.WAHA_API_URL || "http://localhost:7575";
const WAHA_SESSION = process.env.WAHA_SESSION || "default";
const WAHA_KEY = process.env.WAHA_API_KEY || "";

const apiClient = axios.create({
  baseURL: WAHA_URL,
  timeout: 15000, // Timeout 15 detik (lebih aman)
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
    ...(WAHA_KEY ? { "X-Api-Key": WAHA_KEY } : {}),
  },
});

const formatToWhatsAppId = (number) => {
  if (!number) return null;
  let cleaned = number.toString().replace(/[^0-9]/g, "");
  if (cleaned.startsWith("08")) cleaned = "62" + cleaned.slice(1);
  else if (cleaned.startsWith("8")) cleaned = "62" + cleaned;
  if (!cleaned.endsWith("@c.us")) cleaned += "@c.us";
  return cleaned;
};

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

  // KIRIM GAMBAR (SOLUSI BASE64 - GRATIS & STABIL)
  async sendImage(to, imageSource, caption = "") {
    try {
      const chatId = formatToWhatsAppId(to);
      console.log(`​​​​​📷 Memproses kirim gambar ke ${chatId}`);

      let base64Content = null;

      // KASUS A: Input sudah Base64 (Data URI)
      if (imageSource && imageSource.startsWith("data:")) {
        // Ambil bagian datanya saja (setelah koma)
        base64Content = imageSource.split(",")[1];
      }

      // KASUS B: Input adalah Nama File MinIO (Kita download dulu)
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

      // KASUS C: Input URL HTTP (Opsional, skip dulu agar simpel)

      if (!base64Content) {
        throw new Error("Gagal memproses data gambar.");
      }

      // --- KIRIM KE WAHA ---
      // Kita gunakan endpoint /api/sendFile
      // Untuk versi GRATIS, kita wajib kirim datanya langsung di field 'file.data'
      const payload = {
        session: WAHA_SESSION,
        chatId: chatId,
        caption: caption,
        file: {
          filename: "invoice.jpg",
          mimetype: "image/jpeg",
          data: base64Content, // <--- INI KUNCINYA
        },
      };

      await apiClient.post("/api/sendFile", payload);
      console.log(`✅ Gambar berhasil dikirim ke ${chatId}`);
      return true;
    } catch (error) {
      console.error(
        `❌ Gagal Kirim Gambar ke ${to}:`,
        error.response ? error.response.data : error.message
      );

      // Fallback
      await this.sendMessage(to, `${caption}\n\n⚠️ (Gambar gagal dimuat, mohon maaf).`);
      return false;
    }
  },
};
