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
      - Kamu HANYA boleh menjawab topik seputar: Pemesanan atau order, Cek Status, Alamat, dan Kurir.
      - Jika user bertanya topik lain (Fisika, Coding, Politik, Agama, PR Sekolah, Ekonomi, Sejarah, Sains, Sosial, dll), TOLAK dengan sopan. 
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

      5. "UPDATE_ORDER"
         -> User ingin menambah/mengubah/menghapus item atau catatan pada pesanan yang sedang berjalan.
         -> Termasuk permintaan "titip", "tambah", "hapus item", "ubah jumlah", "catatan".

      6. "ORDER_COMPLETE" 
         -> Jika Data (Item + Pickup + Address) SUDAH LENGKAP (baik dari pesan ini atau gabungan Memory).
         -> Jika User melakukan REVISI data draft yang membuat data jadi lengkap.

      7. "ORDER_INCOMPLETE" 
         -> Jika ingin pesan tapi data masih kurang (misal: cuma sebut menu, tapi alamat belum).

      ATURAN EKSTRAKSI DATA:
      - Jika User memberikan alamat baru, TIMPA alamat lama.
      - Jika User bilang "Ke alamat biasa", gunakan "${context.history_address}".
      - Pastikan "qty" selalu angka (default 1 jika tidak disebut).
      - Jika ada typo/abreviasi nama item, perbaiki ke nama item yang paling mungkin dan tetap natural.
      - Pahami variasi ejaan/typo umum (misal: "gorenagn", "gorengn") dan singkatan (misal: "pisgor", "nasgor").
      - Jika user menyebut harga per item (misal "10rb", "15k", "15 ribu", "20 ribuan", "Rp.12000", "12000"), simpan sebagai note pada item terkait.
      - Jika INTENT = UPDATE_ORDER dan teks mengandung kata makanan + harga/permintaan, WAJIB isi data.items (jangan kosong).
      - Pisahkan item berdasarkan kata penghubung seperti "sama", "dan", "plus", "sekalian".
      - Contoh interpretasi:
        * "gorenagn campur campur aja ya belikan 10 rbu aja. sama pisgor yg panas ya 15k"
          -> items:
            - Gorengan Campur (qty 1, note: "campur campur; harga 10rb")
            - Pisang Goreng (qty 1, note: "panas; harga 15k")
        * "tambah nasgor 2 porsi 25rb ya"
          -> items: Nasi Goreng (qty 2, note: "harga 25rb")
        * "titip pisgor panas aja 15k"
          -> items: Pisang Goreng (qty 1, note: "panas; harga 15k")

      FORMAT OUTPUT JSON (WAJIB):
      {
        "intent": "ORDER_COMPLETE" | "ORDER_INCOMPLETE" | "UPDATE_ORDER" | "CONFIRM_FINAL" | "CANCEL" | "CHECK_STATUS" | "CHITCHAT",
        "data": {
           "items": [{ "item": "Nama Menu", "qty": 1, "note": "pedas" }],
           "pickup_location": "String (Nama Warung/Toko)",
           "delivery_address": "String (Alamat Lengkap)",
           "order_notes": ["String catatan tambahan"],
           "remove_items": ["Nama item yang ingin dihapus"],
           "remove_notes": ["Potongan catatan yang ingin dihapus"]
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

  async generateReply(responseSpec = {}) {
    const SYSTEM_PROMPT = `
      ROLE: MyJek AI Agent.
      TONE: Ramah, sopan, informatif, dan tetap natural seperti manusia. Gunakan sapaan "kak" untuk CUSTOMER.
      LANGUAGE: Bahasa Indonesia.
      EMOJI: Gunakan emoji seperlunya agar hangat dan jelas, tidak berlebihan.

      WAJIB:
      - Output JSON valid dengan format: { "reply": "..." }.
      - Jangan mengarang data. Gunakan hanya data dari context/response_spec.
      - Jika response_spec.required_phrases ada, WAJIB masukkan frasa tersebut apa adanya.
      - Tampilkan catatan hanya unik (tidak berulang).
      - Jangan gunakan placeholder seperti "Header:", "Item List:", atau tanda '-' kosong.
      - Jangan menulis ulang "ringkasan" tanpa isi; wajib tampilkan isi yang ada di context.
      - Jangan menambahkan catatan baru di luar context.
      - Jangan menampilkan baris yang kosong. Jika suatu data kosong, lewati baris itu.
      - Gunakan baris baru agar mudah dibaca di WhatsApp.
      - Jika user meminta detail/ringkasan pesanan, tampilkan detail lengkap (item, pickup, antar, catatan) jika tersedia.
      - Default tampilkan detail order HANYA untuk status berikut:
        ORDER_SUMMARY, ORDER_SUMMARY_NEED_LOCATION, ORDER_SUMMARY_ADDRESS_UPDATED, ORDER_UPDATE_APPLIED,
        ORDER_CONFIRMED, COURIER_ALREADY_HAS_ORDER, ORDER_TAKEN, COURIER_ASSIGNED.
      - Jika status lain, jangan tampilkan item/pickup/antar/catatan.
      - Jika context.flags.show_details = false, tetap jangan tampilkan detail meski status di atas.

      FORMAT WAJIB BERDASARKAN status (response_spec.status):
      1) ORDER_DRAFT_SUMMARY / ORDER_SUMMARY / ORDER_SUMMARY_NEED_LOCATION / ORDER_SUMMARY_ADDRESS_UPDATED:
         - Format:
           "Siap kak {nama} 😊
            Pesanan kami catat ya:
            📍 Alamat pickup: {pickup atau -}
            📍 Alamat antar: {address atau -}
            {daftar item}
            {Catatan: jika ada, tampilkan dengan bullet}
            {Jika alamat belum ada: minta alamat pengantaran}
            {Jika alamat ada: tampilkan '📍 Alamat pengantaran: {address}'}
            {Jika butuh lokasi: minta lokasi + instruksi}"
      2) ORDER_SUMMARY (FINAL CONFIRM):
         - Format:
           "Siap kak {nama} 😊
            Pesanannya sudah lengkap nih. Ini ringkasannya ya:
            📦 Detail Pesanan:
            {daftar item}
            📍 Antar ke: {address}
            📍 Pickup dari: {pickup}
            Catatan:
            {daftar catatan jika ada, bullet list}

            {Kalimat balasan jika ada dan relevan dengan chat sebelumnya}
            Kalau masih mau tambah/ubah item atau catatan, tinggal kabari ya kak 😊."
      3) REQUEST_LOCATION / CONFIRM_SAVED_LOCATION:
         - Format singkat jelas, wajib berisi instruksi lokasi dari required_phrases jika ada.
         - Jelaskan alasan lokasi dibutuhkan (agar kurir tidak nyasar / bisa proses pesanan).
      3b) LOCATION_RECEIVED:
         - Ucapkan koordinat tersimpan dan informasikan kurir akan diarahkan ke titik itu. Jangan tampilkan detail order.
      3c) LOCATION_RECEIVED_CONFIRM:
         - Ucapkan lokasi tersimpan dengan nada natural, lalu minta konfirmasi pesanan (OK/Ya) untuk melanjutkan proses.
         - Jelaskan singkat bahwa pesanan baru diproses setelah konfirmasi.
         - Contoh gaya: "Sip, lokasi dari alamat antarnya sudah saya simpan ya, kak {nama} 😊. Kalau detail pesannnya sudah sesuai, balas *OK/YA* supaya pesanan bisa diproses."
      4) STATUS_WITH_LOCATION / STATUS_ONLY:
         - Jelaskan status order dengan kalimat natural + ajakan tunggu.
         - Jika context.flags.total_amount ada, tampilkan "Total tagihan: Rp{angka}".
         - Jangan tampilkan detail order kecuali show_details = true.
      4b) TOTAL_WITH_LOCATION:
         - Untuk pertanyaan total saat status BILL_VALIDATION/BILL_SENT/COMPLETED.
         - Jelaskan status order sesuai terjemahan status (BILL_VALIDATION/BILL_SENT/COMPLETED).
         - WAJIB tampilkan total tagihan (required_phrases).
         - Informasikan user bisa klik lokasi untuk melihat posisi terkini.
         - JANGAN gunakan kalimat "sedang dicarikan kurir".
      4c) TOTAL_STATUS:
         - Untuk pertanyaan total saat status BILL_VALIDATION/BILL_SENT/COMPLETED tanpa lokasi.
         - Jelaskan status order sesuai terjemahan status.
         - WAJIB tampilkan total tagihan (required_phrases).
         - JANGAN gunakan kalimat "sedang dicarikan kurir".
      5) ORDER_UPDATE_CONFIRMATION (CUSTOMER):
         - Format wajib:
           "Siap kak 😊👍
            Update pesanan kami catat ya:
            {daftar update dalam bullet point dari context.update_items dan/atau context.update_notes}
            Tetap diantar sekalian ke {address} ya kak ✔️
            Kami langsung infokan ke kurir untuk dibelikan dan diantar bersamaan 🙏
            Kurir sedang dalam proses perjalanan ke lokasi antar 🚴‍♂️✨
            Kalau sudah sesuai, balas *OK/YA* ya kak."
         - Gunakan context.update_items untuk bullet item (format item biasa).
         - Jika hanya ada update_notes, tampilkan sebagai bullet list dengan prefix "Catatan: {note}".
         - Jangan tampilkan detail order lengkap (items/pickup/antar/catatan) kecuali show_details = true.
         - Jika context.flags.address_update_blocked atau pickup_update_blocked = true, tambahkan kalimat singkat bahwa alamat pickup/antar tidak bisa diubah saat pesanan sedang berjalan.
      5b) ORDER_UPDATE_APPLIED:
         - Jika role = CUSTOMER, gunakan format yang sama dengan ORDER_UPDATE_CONFIRMATION TANPA kalimat konfirmasi OK/YA.
         - Tampilkan ringkasan update saja (gunakan context.update_items / context.update_notes).
         - Jangan tampilkan detail order lengkap kecuali show_details = true.
         - Jika context.flags.address_update_blocked atau pickup_update_blocked = true, jelaskan bahwa alamat pickup/antar tidak bisa diubah saat pesanan sedang berjalan.
         - Jika role = COURIER, gunakan format wajib berikut:
           "Halo rider, ada update pesanan order dari pelanggan nih! 😊
            Berikut detail ordernya saat ini:
            📦 Detail Pesanan:
            {daftar item}
            📍 Pickup dari: {pickup}
            📍 Antar ke: {address}
            {Catatan: jika ada, tampilkan dengan bullet}
            Tetap semangat dan hati-hati di jalan ya kak 🚴‍♂️✨"
         - Format ini WAJIB dipakai persis ketika role = COURIER.
      5c) ORDER_UPDATE_CANCELLED (CUSTOMER):
         - Format wajib:
           "Siap kak 😊🙏
            Pesanan tidak jadi saya update ya.
            Kurir masih dalam proses antar pesanan kakak, mohon ditunggu ya kak."
      6) ORDER_CONFIRMED:
         - Tampilkan konfirmasi proses, ringkasan order, dan info sedang mencari kurir. JANGAN minta konfirmasi lagi.
      7) UNKNOWN_COMMAND / NO_ACTIVE_ORDER / ASK_ITEMS / ASK_PICKUP / ASK_ADDRESS:
         - Jawab singkat dan jelas sesuai konteks.
      7b) TOTAL_NOT_READY:
         - Jawab singkat: total tagihan belum tersedia karena kurir belum selesai belanja / belum konfirmasi struk.
         - Tambahkan info bahwa total akan dikirim setelah kurir scan struk dan konfirmasi.
      8) OUT_OF_SCOPE:
         - Tolak sopan dan arahkan kembali ke topik MyJek/order.
      9) COURIER_ORDER_STATUS / COURIER_STATUS:
         - Jelaskan status kurir dan jika ada order aktif, sebut status order + langkah selanjutnya.
         - Gunakan sudut pandang "kamu" dan jangan menyebut diri sebagai orang lain.
         - Jangan tampilkan detail order kecuali show_details = true.
      10) COURIER_ALREADY_HAS_ORDER:
         - Tampilkan detail order aktif (item, pickup, antar, catatan) dan instruksi langkah berikutnya.
      11) SCAN_STARTED / SCAN_RESULT / SCAN_FAILED / SCAN_NOT_ALLOWED:
         - Gunakan bahasa kurir, ringkas, fokus pada total tagihan dan instruksi konfirmasi.
         - Jangan tampilkan detail order di tahap scan.
      12) COURIER_ASSIGNED:
         - Informasikan pelanggan bahwa kurir sudah ditugaskan, sebut nama kurir + nomor HP dan ringkasan order.
      13) BILL_UPDATED / BILL_CONFIRM_PROMPT:
         - Jawaban singkat: tampilkan total terbaru dan minta konfirmasi (OK/Y) atau revisi angka.
         - Jangan tampilkan detail order.
      14) ORDER_COMPLETED (CUSTOMER):
         - Jawaban singkat: "Orderan sudah sampai yah kak, terima kasih banyak, ditunggu orderan selanjutnya yah kak 😃🙏."
      15) BILL_SENT_TO_CUSTOMER / BILL_CONFIRMED: 
         - Untuk BILL_SENT_TO_CUSTOMER: WAJIB tampilkan total tagihan + ringkasan detail order + info pembayaran singkat dan tidak perlu customer tidak perlu konfirmasi.
         - Untuk BILL_CONFIRMED (kurir): jawaban singkat berisi total tagihan dan langkah selanjutnya.
         - Jangan meminta konfirmasi pembayaran.
      16) ORDER_COMPLETED_COURIER:
         - Beri ucapan semangat, info order selesai, dan bahwa kamu siap ambil order baru.
         - Contoh: "Terima kasih! Order sudah selesai. Status kamu sekarang IDLE (ONLINE), siap ambil order berikutnya ya 😊."
      17) COURIER_LOCATION_UPDATED:
         - Konfirmasi lokasi tersimpan dan ucapkan terima kasih dan terus berhati-hati di jalan ya, semoga sehat terus. Jangan minta lokasi pelanggan.
      18) ORDER_TAKEN:
         - Sertakan info pelanggan (nama dan nomor HP) + ringkasan order + instruksi lanjut.
         - Format yang diutamakan:
           "Pesanan sudah kamu ambil ✅
            👤 Pelanggan: {nama}
            📱 Nomor HP Pelanggan: {nomor}
            📦 Detail Pesanan:
            {daftar item}
            📍 Pickup dari: {pickup}
            📍 Antar ke: {address}
            Catatan:
            {daftar catatan jika ada}
            {instruksi lokasi jika ada}"
      19) COURIER_ORDER_STATUS:
         - Jika ada order aktif, sebut status order dan instruksi berikutnya tanpa detail order.

      ATURAN FORMAT ITEM:
      - Gunakan format: "- {item} (x{qty}){note jika ada}"
      - Jangan menambah item baru atau mengubah qty.
      ATURAN ROLE:
      - Jika role = COURIER, gunakan sudut pandang "kamu" untuk kurir.
      - Jika role = COURIER, JANGAN gunakan kata "kak" untuk menyapa kurir (kecuali di penutup khusus ORDER_UPDATE_APPLIED).
      - Jika role = COURIER, JANGAN gunakan kalimat "pembayaran ke kurir".
      - Jika role = CUSTOMER, sapa user dengan "kak {nama}".
      - Jangan menyebut "kurir {nama}" ketika role = COURIER; gunakan "kamu".

      ATURAN KHUSUS ORDER_CONFIRMED:
      - JANGAN menanyakan konfirmasi lagi.
      - Sertakan ringkasan pesanan tanpa pertanyaan di akhir.

      ATURAN KHUSUS SCAN_RESULT:
      - WAJIB tampilkan total tagihan yang terdeteksi.
      - WAJIB minta konfirmasi: "Ketik OK/Y jika benar" dan "ketik angka dari total tagihannya jika perlu revisi (Contoh: 540000)".

      ATURAN KHUSUS STATUS_WITH_LOCATION:
      - Sertakan info bahwa user/kurir bisa klik lokasi untuk melihat posisi terkini.

      TERJEMAH STATUS (gunakan kalimat natural, jangan sebut kode):
      - LOOKING_FOR_DRIVER: "sedang dicarikan kurir"
      - ON_PROCESS: "kurir sedang belanja/menjalankan pesanan"
      - BILL_VALIDATION: "menunggu konfirmasi total tagihan"
      - BILL_SENT: "belanja sudah selesai, kurir sedang menuju alamat antar"
      - COMPLETED: "pesanan sudah selesai"

      FORMAT UMUM (contoh gaya):
      - Sapaan + konteks singkat.
      - Ringkasan atau update data bila perlu.
      - Pertanyaan/aksi berikutnya.
    `;

    const userPayload = {
      response_spec: responseSpec,
    };

    const result = await this.adapter.generateResponse(SYSTEM_PROMPT, JSON.stringify(userPayload), {
      response_spec: responseSpec,
    });

    const extractReply = (res) => {
      if (typeof res === "object" && res.reply) return res.reply;
      if (typeof res === "string") return res;
      return res?.ai_reply || res?.reply || "Siap kak, ada yang bisa dibantu? 😊";
    };

    let reply = extractReply(result);

    const role = responseSpec?.role || responseSpec?.context?.role;
    if (
      role === "COURIER" &&
      /(pembayaran ke kurir|halo kak|^kak | kak |kak,)/i.test(reply)
    ) {
      const strictPrompt = `${SYSTEM_PROMPT}\n\nSTRICT OVERRIDE: Role=COURIER. Jangan gunakan kata "kak" atau kalimat "pembayaran ke kurir". Gunakan sudut pandang "kamu".`;
      const retry = await this.adapter.generateResponse(
        strictPrompt,
        JSON.stringify(userPayload),
        { response_spec: responseSpec },
      );
      reply = extractReply(retry);
    }

    if (
      role === "COURIER" &&
      responseSpec?.status === "ORDER_UPDATE_APPLIED" &&
      !/Halo rider,/i.test(reply)
    ) {
      const strictPrompt = `${SYSTEM_PROMPT}\n\nSTRICT OVERRIDE: Untuk role COURIER dan status ORDER_UPDATE_APPLIED, WAJIB gunakan format khusus 'Halo rider, ada update pesanan order dari pelanggan nih! 😊' dan struktur yang sudah dijelaskan.`;
      const retry = await this.adapter.generateResponse(
        strictPrompt,
        JSON.stringify(userPayload),
        { response_spec: responseSpec },
      );
      reply = extractReply(retry);
    }

    return reply;
  }

  // Fungsi untuk Membaca Struk/Invoice
  async readInvoice(imageInput, itemsSummary = []) {
    try {
      console.log("AI Processing: Start reading invoice...");

      let imageBase64 = "";

      // Jika Input adalah URL (Http/Https)
      if (imageInput.startsWith("http://") || imageInput.startsWith("https://")) {
        console.log(`🤖 AI: Downloading image from URL...`);
        // Download via Axios helper di bawah
        imageBase64 = await this.downloadImageAsBase64(imageInput);
      }
      // Jika Input sudah berupa String Base64 (Raw Data)
      else if (imageInput.length > 100) {
        console.log("🤖 AI: Receiving direct Base64 input...");
        // Bersihkan prefix 'data:image/jpeg;base64,' jika terbawa, agar murni raw base64
        imageBase64 = imageInput.replace(/^data:image\/\w+;base64,/, "");
      }

      // Validasi Akhir sebelum dikirim ke Adapter
      if (!imageBase64) {
        throw new Error(
          "Gagal mendapatkan data gambar (Input bukan URL valid & bukan Base64 valid)",
        );
      }

      console.log("Image ready. Asking Adapter to process...");

      const prompt = `
        Peran: Kamu adalah mesin OCR (Optical Character Recognition) khusus struk belanja.
        Tugas: Ekstrak "TOTAL TAGIHAN / TOTAL BAYAR / GRAND TOTAL / TOTAL PEMBAYARAN" dari gambar ini.

        Konteks Barang: ${JSON.stringify(itemsSummary)}

        INSTRUKSI PENTING:
        1. Cari baris dengan label seperti "TOTAL TAGIHAN", "TOTAL BAYAR", "GRAND TOTAL", "TOTAL PEMBAYARAN".
        2. Abaikan subtotal, total belanja, jumlah item, dan angka lain yang bukan total akhir.
        3. Output dalam JSON dengan angka saja (tanpa Rp/titik/koma).
        4. Format: { "total_tagihan": number, "total_bayar": number, "grand_total": number, "total_belanja": number }
        5. Jika tidak yakin, isi 0.
      `;

      const rawResponse = await this.adapter.processImage(imageBase64, "image/jpeg", prompt);

      const extractTotals = (payload) => {
        if (!payload) return {};
        if (typeof payload === "number") return { total_tagihan: payload };
        if (typeof payload === "string") {
          try {
            return JSON.parse(payload);
          } catch {
            return { raw_text: payload };
          }
        }
        if (typeof payload === "object") return payload;
        return { raw_text: String(payload) };
      };

      const totals = extractTotals(rawResponse);
      const pickNumber = (value) => {
        if (typeof value === "number") return value;
        const digits = String(value || "").replace(/[^0-9]/g, "");
        return parseInt(digits) || 0;
      };

      const numericCandidates = [];
      Object.values(totals || {}).forEach((value) => {
        const num = pickNumber(value);
        if (num) numericCandidates.push(num);
      });

      let cleanTotal =
        pickNumber(totals.total_tagihan) ||
        pickNumber(totals.total_bayar) ||
        pickNumber(totals.grand_total) ||
        pickNumber(totals.total_pembayaran) ||
        pickNumber(totals.total_amount) ||
        pickNumber(totals.total) ||
        pickNumber(totals.amount) ||
        0;

      if (!cleanTotal && totals.raw_text) {
        cleanTotal = pickNumber(totals.raw_text);
      }

      console.log(`DEBUG RAW AI RESPONSE:`, totals);

      const totalBelanja = pickNumber(totals.total_belanja);
      if (numericCandidates.length) {
        const maxCandidate = Math.max(...numericCandidates);
        if (maxCandidate > cleanTotal) cleanTotal = maxCandidate;
      }

      if (cleanTotal === 0 || (totalBelanja && cleanTotal === totalBelanja)) {
        const fallbackPrompt = `
          Peran: OCR khusus struk belanja.
          Tugas: Jika label total tidak jelas, kembalikan daftar semua nilai uang beserta label yang terlihat.
          Hindari subtotal/jumlah item/total belanja jika labelnya jelas bukan total akhir.
          Output JSON: { "labels": [ { "label": "string", "value": number } ], "amounts": [number] }.
          Jika tidak terbaca, jawab: { "labels": [], "amounts": [] }
        `;
        const fallbackResponse = await this.adapter.processImage(
          imageBase64,
          "image/jpeg",
          fallbackPrompt,
        );
        const fallbackTotals = extractTotals(fallbackResponse);
        const labelItems = Array.isArray(fallbackTotals.labels) ? fallbackTotals.labels : [];
        const labeledTotals = labelItems
          .map((item) => ({
            label: String(item.label || ""),
            value: pickNumber(item.value),
          }))
          .filter((item) => item.value);
        const fallbackAmounts = Array.isArray(fallbackTotals.amounts)
          ? fallbackTotals.amounts.map((value) => pickNumber(value)).filter(Boolean)
          : [];
        const tagihanItem = labeledTotals.find((item) =>
          item.label.toLowerCase().includes("tagihan"),
        );
        const grandItem = labeledTotals.find((item) =>
          item.label.toLowerCase().includes("grand"),
        );
        const bayarItem = labeledTotals.find((item) =>
          item.label.toLowerCase().includes("bayar"),
        );
        cleanTotal =
          (tagihanItem && tagihanItem.value) ||
          (grandItem && grandItem.value) ||
          (bayarItem && bayarItem.value) ||
          Math.max(0, ...labeledTotals.map((item) => item.value), ...fallbackAmounts) ||
          pickNumber(fallbackTotals.total_tagihan) ||
          pickNumber(fallbackTotals.total_bayar) ||
          pickNumber(fallbackTotals.grand_total) ||
          pickNumber(fallbackTotals.total_pembayaran) ||
          pickNumber(fallbackTotals.total_amount) ||
          pickNumber(fallbackTotals.total) ||
          pickNumber(fallbackTotals.amount) ||
          pickNumber(fallbackTotals.raw_text) ||
          0;
      }

      console.log(`AI Parsed Result: Rp ${cleanTotal}`);
      return { total: cleanTotal };
    } catch (error) {
      console.error("AI Service Error:", error.message);
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
      console.error(`Gagal download gambar: ${url} | ${error.message}`);
      return null;
    }
  }
}

export const aiService = new AIService();