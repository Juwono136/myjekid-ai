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

    const result = await this.adapter.generateResponse(SYSTEM_PROMPT, text, context);

    return result;
  }

  // Fungsi untuk Membaca Struk/Invoice
  async readInvoice(imageInput, itemsSummary = []) {
    try {
      console.log("🤖 AI Processing: Start reading invoice...");

      let imageBase64 = "";

      // --- LOGIC 1: Jika Input adalah URL (Http/Https) ---
      if (imageInput.startsWith("http://") || imageInput.startsWith("https://")) {
        console.log(`🤖 AI: Downloading image from URL...`);
        // Download via Axios helper di bawah
        imageBase64 = await this.downloadImageAsBase64(imageInput);
      }
      // --- LOGIC 2: Jika Input sudah berupa String Base64 (Raw Data) ---
      else if (imageInput.length > 100) {
        console.log("🤖 AI: Receiving direct Base64 input...");
        // Bersihkan prefix 'data:image/jpeg;base64,' jika terbawa, agar murni raw base64
        imageBase64 = imageInput.replace(/^data:image\/\w+;base64,/, "");
      }

      // Validasi Akhir sebelum dikirim ke Adapter
      if (!imageBase64) {
        throw new Error(
          "Gagal mendapatkan data gambar (Input bukan URL valid & bukan Base64 valid)"
        );
      }

      console.log("✅ Image ready. Asking Adapter to process...");

      const prompt = `
        Peran: Kamu adalah mesin OCR (Optical Character Recognition) khusus struk belanja.
        Tugas: Ekstrak "TOTAL PEMBAYARAN" atau "GRAND TOTAL" dari gambar ini.

        Konteks Barang: ${JSON.stringify(itemsSummary)}

        INSTRUKSI PENTING:
        1. Cari angka nominal uang terbesar yang merepresentasikan total akhir transaksi.
        2. HANYA tuliskan angkanya saja. JANGAN pakai teks 'Rp', titik, koma, atau spasi.
        3. Contoh Output Benar: 50000
        4. Contoh Output Salah: "Totalnya 50.000", "Rp 50.000", "50,000"
        
        Jika tidak yakin atau gambar buram, jawab: 0
      `;

      const rawResponse = await this.adapter.processImage(imageBase64, "image/jpeg", prompt);

      // --- [STEP PERBAIKAN UTAMA: SAFETY CONVERSION] ---
      let textString = "";

      if (typeof rawResponse === "string") {
        textString = rawResponse;
      } else if (typeof rawResponse === "object") {
        // Jika Adapter mengembalikan Object/JSON, kita stringify dulu
        textString = JSON.stringify(rawResponse);
      } else {
        // Jika number atau tipe lain
        textString = String(rawResponse);
      }

      console.log(`🔍 DEBUG RAW AI RESPONSE (Type: ${typeof rawResponse}): "${textString}"`);

      // 3. Clean Result (Sekarang aman karena textString PASTI string)
      const cleanText = textString.replace(/[^0-9]/g, "");
      const cleanTotal = parseInt(cleanText) || 0;

      console.log(`💰 AI Parsed Result: Rp ${cleanTotal}`);
      return { total: cleanTotal };
    } catch (error) {
      console.error("❌ AI Service Error:", error.message);
      // Return 0 agar tidak crash, flow bisa lanjut ke input manual
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
