import axios from "axios";
import AIAdapterFactory from "./AIAdapterFactory.js";

class AIService {
  constructor() {
    this.adapter = AIAdapterFactory.createAdapter();
  }

  // ============================================================
  // 1. BRAIN: AI AGENT (USER FLOW)
  // ============================================================
  async chatWithAgent(user, draftOrder, userMessage) {
    // 1. Context Data (Memory)
    const contextData = {
      customer_name: user.name || "Kak",
      customer_phone: user.phone,
      existing_address: user.address_text || "Belum ada",
      has_location_coords: !!(user.latitude && user.longitude),

      // Status Order Draft
      current_draft: draftOrder
        ? {
            items: draftOrder.items_summary,
            pickup: draftOrder.pickup_address,
            delivery: draftOrder.delivery_address,
            total_estimated: draftOrder.total_amount,
          }
        : "Belum ada order aktif.",

      // Pesan User (Bisa berisi info dari System soal gambar struk)
      user_input: userMessage,
    };

    // 2. System Prompt (Instruksi Perilaku)
    const SYSTEM_PROMPT = `
      ROLE: Kamu adalah "MyJek Assistant", customer service profesional (AI Agent) yang ramah, luwes, dan cerdas.
      GOAL: Bantu user membuat pesanan (Order) sampai data lengkap (Item, Lokasi Jemput, Lokasi Antar).

      STYLE:
      - Bicara natural bahasa Indonesia sehari-hari yang sopan (seperti Admin Online Shop profesional).
      - Jangan kaku! Gunakan emoji secukupnya (🙏, 😊, 👍).
      - JIKA user melakukan "Hit and Run" (info borongan), LANGSUNG tangkap semua infonya.
      
      LOGIC HANDLING:
      - Jika user kirim ALAMAT tapi belum share location (koordinat), ingatkan sopan: "Boleh minta Share Location (Peta) nya kak biar akurat?".
      - Jika di input ada info "[SYSTEM: User kirim foto STRUK tagihan senilai Rp X]", maka anggap user sudah konfirmasi harga/bayar. Respon dengan terima kasih.
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "thought": "Analisa singkat situasinya",
        "reply_text": "Kalimat jawabanmu ke user (ini yang akan dibaca user)",
        "extracted_data": {
          "items": Array<{item: string, qty: number, note: string}> (Gabung dengan item lama jika ada),
          "pickup_address": "String (Nama resto/toko)",
          "delivery_address": "String (Alamat tujuan)",
          "is_finalized": boolean (Set true HANYA jika Item, Pickup, dan Delivery sudah JELAS)
        },
        "intent": "ORDER_FLOW" | "CANCEL" | "CHITCHAT" | "COMPLAINT"
      }
    `;

    // 3. Generate Response
    try {
      const aiResponse = await this.adapter.generateResponse(
        SYSTEM_PROMPT,
        JSON.stringify(contextData),
      );

      if (!aiResponse || !aiResponse.reply_text) {
        throw new Error("Empty response from AI Agent");
      }

      console.log("🤖 AI Agent Thought:", aiResponse.thought);
      return aiResponse;
    } catch (error) {
      console.error("❌ AI Agent Error:", error);
      return {
        reply_text: "Waduh, koneksi saya agak gangguan kak. Boleh ulangi pesannya? 🙏",
        extracted_data: {},
        intent: "CHITCHAT",
      };
    }
  }

  // ============================================================
  // 2. VISION: READ RECEIPT / STRUK (TOTAL BILL)
  // ============================================================
  /**
   * Khusus membaca gambar struk/nota dan mengambil "Total Tagihan".
   * Return: Number (Total Amount)
   */
  async analyzeReceiptImage(imageUrl) {
    try {
      console.log(`🧾 Analyzing Receipt: ${imageUrl}`);

      const base64Data = await this.downloadImageAsBase64(imageUrl);
      if (!base64Data) return 0;

      // Prompt spesifik agar AI fokus cari angka duit total
      const prompt = `
        Analisa gambar ini. Ini adalah struk belanja atau bukti transfer.
        Cari angka "TOTAL BAYAR" atau "TOTAL TRANSFER" atau "JUMLAH".
        Abaikan rincian item. HANYA ambil angka total akhirnya saja.
        Jika tidak menemukan angka uang yang valid, return 0.
      `;

      // Panggil Adapter Vision
      // Kita minta return JSON { total: number }
      const rawResponse = await this.adapter.processImage(base64Data, "image/jpeg", prompt);

      // Parsing hasil (Support return object atau string)
      let total = 0;
      if (typeof rawResponse === "object" && rawResponse.total) {
        total = parseInt(rawResponse.total);
      } else if (typeof rawResponse === "string") {
        const clean = rawResponse.replace(/[^0-9]/g, "");
        total = parseInt(clean) || 0;
      }

      console.log(`💰 Struk Total Detected: Rp ${total}`);
      return total;
    } catch (error) {
      console.error("❌ Receipt Analysis Error:", error.message);
      return 0; // Return 0 jika gagal, agar flow tidak error
    }
  }

  // Helper: Download Image
  async downloadImageAsBase64(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { Accept: "*/*" }, // Sesuaikan header jika butuh API Key
      });
      return Buffer.from(response.data, "binary").toString("base64");
    } catch (error) {
      console.error("❌ Failed download image:", error.message);
      return null;
    }
  }
}

export const aiService = new AIService();
