import axios from "axios";
import AIAdapterFactory from "./AIAdapterFactory.js";

class AIService {
  constructor() {
    // Meminta Factory membuatkan adapter yang sesuai file .env
    this.adapter = AIAdapterFactory.createAdapter();
  }

  async parseOrder(text, context) {
    const SYSTEM_PROMPT = `
      ROLE: Customer Service 'MyJek' (Aplikasi Ojek & Kurir Online di Sumbawa).
      TONE: Ramah, Terstruktur, Singkat, dan Membantu.

      DOMAIN RESTRICTION (CRITICAL):
      - Kamu HANYA boleh menjawab topik seputar: Pemesanan, Cek Status, Alamat, dan Kurir.
      - Jika user bertanya topik lain (Fisika, Coding, Politik, Agama, PR Sekolah), TOLAK dengan sopan. 
        Contoh: "Maaf Kak, saya adalah Asisten khusus untuk pesan antar dari MyJek, jadi belum paham soal itu hehe. 😅🙏"

      CONTEXT DATA:
      - Nama User: ${context.user_name}
      - Status Order: ${context.current_order_status}
      - Data Draft (Memory): ${JSON.stringify(context.draft_data || {})}
      - History Alamat: ${context.history_address || "Belum ada"}

      TUGAS UTAMA:
      Analisa pesan masuk, EKSTRAK entitas (Item, Pickup, Address), lalu tentukan INTENT.

      ATURAN INTENT:
      1. "CHECK_STATUS" 
         -> User bertanya posisi/status (e.g., "Pesanan saya mana?", "Belum sampai?").
      
      2. "CHITCHAT" 
         -> Sapaan ("Halo", "Pagi").
         -> Ucapan sopan penutup ("Makasih", "Oke thanks", "Siap", "Mantap").
         -> Pertanyaan di luar topik MyJek.
      
      3. "CONFIRM_FINAL" 
         -> User bilang "Ya", "Benar", "Gas", "Lanjut" SAAT status order = WAITING_CONFIRMATION.
      
      4. "CANCEL" 
         -> User ingin membatalkan ("Batal", "Cancel", "Gajadi").

      5. "ORDER_COMPLETE" 
         -> Jika Data (Item + Pickup + Address) SUDAH LENGKAP (baik dari pesan ini atau gabungan Memory).
         -> Jika User melakukan REVISI data draft yang membuat data jadi lengkap.

      6. "ORDER_INCOMPLETE" 
         -> Jika ingin pesan tapi data masih kurang (misal: cuma sebut menu, tapi alamat belum).

      ATURAN EKSTRAKSI DATA:
      - Jika User memberikan alamat baru, TIMPA alamat lama.
      - Jika User bilang "Ke alamat biasa", gunakan "${context.history_address}".
      - Pastikan "qty" selalu angka (default 1 jika tidak disebut).

      FORMAT OUTPUT JSON (WAJIB):
      {
        "intent": "ORDER_COMPLETE" | "ORDER_INCOMPLETE" | "CONFIRM_FINAL" | "CANCEL" | "CHECK_STATUS" | "CHITCHAT",
        "data": {
           "items": [{ "item": "Nama Menu", "qty": 1, "note": "pedas" }],
           "pickup_location": "String (Nama Warung/Toko)",
           "delivery_address": "String (Alamat Lengkap)" 
        },
        "ai_reply": "String text untuk user"
      }

      GUIDE PENGISIAN 'ai_reply':
      - Jika CHITCHAT (Out of scope): Tolak sopan.
      - Jika CHITCHAT (Sopan santun): Balas ramah ("Sama-sama kak!").
      - Jika ORDER_INCOMPLETE: Tanyakan data yang kurang (Contoh: "Siap kak, mau diantar ke alamat mana?").
      - Jika ORDER_COMPLETE: Cukup bilang "Baik kak, mohon dicek ringkasannya di bawah ini 👇" (JANGAN TULIS ULANG STRUK DI SINI, Sistem yang akan buat).
    `;

    return await this.adapter.generateResponse(SYSTEM_PROMPT, text, context);
  }

  // Fungsi untuk Membaca Struk/Invoice
  async readInvoice(mediaUrl, itemsSummary = []) {
    try {
      console.log(`🤖 AI Processing: Downloading image from ${mediaUrl}...`);

      // Download Gambar dari WAHA (Wajib pakai Header Auth)
      const imageBase64 = await this.downloadImageAsBase64(mediaUrl);

      if (!imageBase64) {
        throw new Error("Gagal mendownload gambar (Base64 is null)");
      }

      console.log("✅ Image downloaded. Asking Adapter to process...");

      const prompt = `
        Kamu adalah asisten kasir yang cerdas.
        Tugasmu: Analisa gambar struk/nota belanja ini.
        
        Konteks Barang yang harusnya dibeli: ${JSON.stringify(itemsSummary)}
        
        Instruksi Output:
        Hanya kembalikan SATU ANGKA (Integer) yaitu TOTAL HARGA AKHIR yang harus dibayar.
        Jangan ada teks lain, jangan ada 'Rp', titik, atau koma. Hanya angka murni.
        Jika gambar buram atau bukan struk, kembalikan angka 0.
      `;

      const aiResponseText = await this.adapter.processImage(imageBase64, "image/jpeg", prompt);

      // Proses Hasil (Cleaning)
      const cleanTotal = parseInt(aiResponseText.replace(/[^0-9]/g, "")) || 0;

      console.log(`💰 AI Result: Rp ${cleanTotal}`);
      return { total: cleanTotal };
    } catch (error) {
      console.error("❌ AI Service Error:", error.message);
      return { total: 0 };
    }
  }

  // Download Gambar (base64)
  async downloadImageAsBase64(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: {
          "X-Api-Key": process.env.WAHA_API_KEY || "",
          Accept: "*/*",
        },
      });
      return Buffer.from(response.data, "binary").toString("base64");
    } catch (error) {
      console.error(`❌ Gagal download gambar: ${url} | ${error.message}`);
      return null;
    }
  }
}

export const aiService = new AIService();
