import axios from "axios";
import AIAdapterFactory from "./AIAdapterFactory.js";
import { SUMBAWA_PLACES as FALLBACK_SUMBAWA_PLACES } from "../../constants/sumbawaPlaces.js";

class AIService {
  constructor() {
    // Meminta Factory membuatkan adapter yang sesuai file .env
    this.adapter = AIAdapterFactory.createAdapter();

    this._placesCache = {
      sumbawa: {
        fetchedAt: 0,
        data: null,
      },
    };
  }

  _isValidPlaceList(list) {
    if (!Array.isArray(list) || list.length === 0) return false;
    // Minimal 1 item valid; biar fleksibel kalau data belum lengkap semua
    return list.some((p) => {
      if (!p || typeof p !== "object") return false;
      const nameOk = typeof p.name === "string" && p.name.trim().length > 1;
      const typeOk =
        typeof p.type === "string" && ["makan", "minum", "wisata"].includes(p.type.toLowerCase());
      const mapOk = typeof p.mapUrl === "string" && /^https?:\/\//i.test(p.mapUrl);
      return nameOk && typeOk && mapOk;
    });
  }

  /**
   * Ambil catalog tempat Sumbawa secara dinamis.
   * - Jika SUMBAWA_PLACES_URL diset, fetch JSON dari URL tsb (cache 1 jam).
   * - Jika gagal/kosong, fallback ke list lokal `sumbawaPlaces.js`.
   *
   * Format JSON yang diharapkan: Array<{ name, type: 'makan'|'minum'|'wisata', description?, area?, mapUrl }>
   */
  async getSumbawaPlaces() {
    const url = (process.env.SUMBAWA_PLACES_URL || "").trim();
    const TTL_MS = 60 * 60 * 1000; // 1 jam

    const cached = this._placesCache.sumbawa;
    const now = Date.now();
    if (cached.data && now - cached.fetchedAt < TTL_MS) return cached.data;

    if (url) {
      try {
        const resp = await axios.get(url, { timeout: 15000 });
        const data = resp?.data;
        if (this._isValidPlaceList(data)) {
          cached.data = data;
          cached.fetchedAt = now;
          return data;
        }
      } catch (e) {
        // fallback di bawah
      }
    }

    cached.data = FALLBACK_SUMBAWA_PLACES;
    cached.fetchedAt = now;
    return cached.data;
  }

  async parseIntent(text, context) {
    const SYSTEM_PROMPT = `
ROLE: Customer Service MyJek (Aplikasi Ojek & Kurir Online di Sumbawa). Tugasmu HANYA menentukan INTENT dari pesan pelanggan.

INTENT:
- GREETING: Sapaan saja tanpa pesan order (Pagi, Halo, Assalamualaikum).
- ORDER: Detail pesanan / mau pesan / jemput / belikan sesuatu.
- CONFIRMATION: Konfirmasi (Ok, Ya, Lanjut, Sip, Gas).
- CANCELLATION: Batalkan pesanan (Batal, Gak jadi, Cancel).
- CHECK_STATUS: Tanya status pesanan (sampai mana?, udah jalan belum?).
- HUMAN_HANDOFF: Minta admin/CS (#HUMAN, Admin, Komplain).
- REKOMENDASI_TEMPAT: Tanya rekomendasi tempat makan/minum/restoran/kafe/wisata di Sumbawa (rekomen tempat makan, wisata Sumbawa, cafe).
- OTHER: Di luar kategori di atas.

Aturan: Jika sapaan + pesanan sekaligus, intent = ORDER.
Output HANYA JSON: { "intent": "NAMA_INTENT" }
`;

    const parseJsonMaybe = (value) => {
      if (typeof value !== "string") return null;
      const s = value.trim();
      if (!s.startsWith("{") || !s.endsWith("}")) return null;
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    const heuristicIntent = (raw) => {
      const t = String(raw || "").toLowerCase();
      if (t === "#human" || /\b(admin|cs|komplain)\b/i.test(t)) return "HUMAN_HANDOFF";
      if (/\b(batal|cancel|gak jadi|tidak jadi)\b/i.test(t)) return "CANCELLATION";
      if (/\b(cek|status|sampai mana|udah jalan|sudah jalan)\b/i.test(t)) return "CHECK_STATUS";
      if (
        /(rekomendasi|rekomen|rekomendasiin|saran|referensi|list tempat|daftar tempat)/i.test(t) &&
        /(tempat|resto|restoran|rm|rumah makan|makan|minum|kafe|cafe|wisata|pantai|gunung|tour|turis)/i.test(t)
      )
        return "REKOMENDASI_TEMPAT";
      if (/^(ok|oke|ya|iya|sip|siap|y|yes|gas|lanjut|setuju|boleh)\b/i.test(t)) return "CONFIRMATION";
      if (/\b(halo|hai|pagi|siang|sore|malam|assalamualaikum)\b/i.test(t)) return "GREETING";
      return null;
    };

    const result = await this.adapter.generateResponse(SYSTEM_PROMPT, text, context);
    const parsed = parseJsonMaybe(result);
    const intent = parsed?.intent || result?.intent || heuristicIntent(text) || "OTHER";
    return { intent };
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
      - Saat menampilkan detail order lengkap (item, pickup, antar, catatan), WAJIB sertakan Order ID dan Kode ID jika context.order_id atau context.short_code ada. Format: baris "🆔 Order ID: {order_id} | Kode: {short_code}" di atas atau di awal blok detail (contoh: sebelum "📦 Detail Pesanan:").
      - Default tampilkan detail order HANYA untuk status berikut:
        ORDER_SUMMARY, ORDER_SUMMARY_NEED_LOCATION, ORDER_SUMMARY_ADDRESS_UPDATED, ORDER_UPDATE_APPLIED,
        ORDER_CONFIRMED, COURIER_ALREADY_HAS_ORDER, ORDER_TAKEN, COURIER_ASSIGNED.
      - Jika status lain, jangan tampilkan item/pickup/antar/catatan.
      - Jika context.flags.show_details = false, tetap jangan tampilkan detail meski status di atas.

      MEKANISME TAMPILAN DETAIL ORDER (SESUAI DATA SAAT INI):
      - Order di sistem hanya menyimpan chat_messages (seluruh pesan chat pelanggan). Jika context.chat_messages ada (array of string) dan context.items kosong/tidak ada, tampilkan sebagai: "📋 Pesan order dari pelanggan:" lalu tiap elemen chat_messages sebagai baris/bullet. Jangan mengarang item/pickup/address jika tidak ada di context.
      - Jika context.items, context.pickup, context.address ada (ringkasan terstruktur), tetap boleh tampilkan dalam format 📦 Detail Pesanan, 📍 Pickup dari, 📍 Antar ke seperti biasa.
      - Prioritas: jika chat_messages ada dan items/pickup/address kosong, gunakan format pesan chat; jika items/pickup/address ada, gunakan format ringkasan.

      FORMAT WAJIB BERDASARKAN status (response_spec.status):

      --- KONTEKS: BUAT ORDER BARU (bukan update order berjalan) ---
      Status 1, 2, 3, 3a, 3b, 3c dipakai HANYA saat pelanggan sedang MEMBUAT order baru.
      Alur pesan: (1) Tampilkan detail order, (2) Tanya konfirmasi koordinat — alamat antarnya masih sama atau beda? Kalau beda silakan update dulu (instruksi kirim lokasi), (3) Konfirmasi terakhir: balas OK/Ya sebelum pesanan beneran dibuat dan kami carikan kurir. Gunakan kalimat natural dan tidak kaku.
      ATURAN UMUM BUAT ORDER BARU (DRAFT/PENDING_CONFIRMATION): Setiap balasan WAJIB (1) menampilkan ringkasan order yang sudah ada (item, pickup, antar — isi dengan "-" atau "belum diisi" hanya jika benar-benar kosong), (2) menyebut apa yang masih kurang atau langkah berikutnya, (3) memberi instruksi yang jelas dan relevan dengan chat terakhir pelanggan agar pelanggan tidak bingung. Jangan lompat ke topik lain; respons harus nyambung dengan yang pelanggan kirim. JANGAN duplikasi: alamat antar tampilkan HANYA SEKALI. context.address = hanya lokasi/tempat pengantaran; context.notes = catatan (titip/serah terima); jangan gabung catatan ke dalam alamat.

      1) ORDER_DRAFT_SUMMARY / ORDER_SUMMARY / ORDER_SUMMARY_NEED_LOCATION / ORDER_SUMMARY_ADDRESS_UPDATED:
         - Jika context.order_id atau context.short_code ada, WAJIB tampilkan di baris pertama setelah "Pesanan kami catat ya": "🆔 Order ID: {order_id} | Kode: {short_code}" (baris baru lalu baris ini).
         - Format (TANPA duplikasi — alamat antar HANYA sekali):
           "Siap kak {nama} 😊
            Pesanan kami catat ya:
            {Jika order_id/short_code ada: baris 🆔 Order ID: {order_id} | Kode: {short_code}}
            📍 Alamat pickup: {pickup atau - jika kosong}
            📍 Alamat antar: {address atau - jika kosong — GUNAKAN context.address, JANGAN gabung dengan catatan titip}
            📦 Detail Pesanan:
            {daftar item}
            {Jika context.notes ada: baris Catatan: lalu bullet list catatan}
            {Satu blok instruksi singkat: jika address kosong → minta sebutkan alamat pengantaran + setelah itu sebutkan alamat pickup jika belum. Jika address ada tapi pickup kosong → minta alamat pickup. Jika address dan pickup ada → konfirmasi singkat (alamat antar sudah kami catat) dan minta balas OK/Ya untuk konfirmasi terakhir supaya pesanan kami proses dan carikan kurir. Jika butuh koordinat → satu kalimat minta kirim lokasi (Clip 📎 -> Location) lalu OK/Ya untuk konfirmasi. JANGAN ulangi kalimat yang sama dua kali.}"
         - KRITIKAL: Jika context.address ada dan tidak kosong, WAJIB isi "📍 Alamat antar:" dengan context.address (bukan "-"). JANGAN tampilkan baris "📍 Alamat pengantaran" atau "Alamat pengantaran:" terpisah — cukup SATU baris "📍 Alamat antar:" untuk lokasi; catatan titip HANYA di bagian Catatan (bullet), bukan di dalam alamat.
         - Contoh format benar (ada alamat + catatan titip): "📍 Alamat antar: Kantor BKPSDM, ruang Pak Samsi" lalu di bawah Detail Pesanan: "Catatan:\n• Bilang aja titipan dari Bu Titin." SALAH: menambah baris "📍 Alamat pengantaran: kantor bkpsdm ... bilang aja titipan dari bu titin" — itu duplikasi dan menggabung lokasi dengan catatan.
      2) ORDER_SUMMARY (FINAL CONFIRM) — hanya untuk BUAT ORDER BARU:
         - Jika context.order_id atau context.short_code ada, WAJIB tampilkan di baris pertama setelah "Ini ringkasannya ya": "🆔 Order ID: {order_id} | Kode: {short_code}" (baris baru lalu baris ini).
         - Format:
           "Siap kak {nama} 😊
            Pesanannya sudah lengkap nih. Ini ringkasannya ya:
            {Jika order_id/short_code ada: baris 🆔 Order ID: {order_id} | Kode: {short_code}}
            📦 Detail Pesanan:
            {daftar item}
            📍 Antar ke: {address}
            📍 Pickup dari: {pickup}
            Catatan:
            {daftar catatan jika ada, bullet list}

            Konfirmasi dulu ya kak: koordinat alamat antarnya masih sama atau sudah beda? Kalau beda, silakan update dulu lokasinya (kirim lokasi lewat Clip 📎 -> Location -> Send Your Current Location). Kalau masih sama atau sudah update, balas *OK/Ya* untuk konfirmasi terakhir ya — baru pesanan kami proses dan kami carikan kurirnya 😊.
            Kalau mau tambah/ubah item atau catatan sebelum itu, tinggal kabari ya kak."
      3) REQUEST_LOCATION / CONFIRM_SAVED_LOCATION — hanya untuk BUAT ORDER BARU:
         - REQUEST_LOCATION = pelanggan BARU (belum pernah kirim koordinat). WAJIB balasan singkat: minta kirim lokasi koordinat alamat antar (instruksi Clip 📎 -> Location -> Send Your Current Location) agar kurir tidak nyasar. JANGAN gunakan "apakah alamat antarnya masih sama" — itu untuk pelanggan lama (REQUEST_LOCATION_CONFIRM_ADDRESS).
         - CONFIRM_SAVED_LOCATION = setelah ada lokasi/koordinat: tanya konfirmasi (masih sama atau beda), lalu minta balas OK/Ya untuk konfirmasi terakhir sebelum pesanan diproses dan dicarikan kurir. Wajib berisi instruksi lokasi dari required_phrases jika ada. Natural, tidak kaku.
      3a) REQUEST_LOCATION_CONFIRM_ADDRESS — hanya untuk BUAT ORDER BARU (pelanggan yang sudah pernah order, punya alamat tersimpan):
         - Konfirmasi: alamat antarnya masih sama dengan *[alamat]* atau sudah beda? Kalau masih sama, balas OK/Ya. Kalau beda, silakan update dulu koordinat (instruksi Clip 📎 -> Location -> Send Your Current Location). Setelah itu balas OK/Ya untuk konfirmasi terakhir supaya pesanan kami proses dan carikan kurir. Natural, tidak kaku. WAJIB sertakan instruksi Clip/Location jika ada required_phrases.
      3b) LOCATION_RECEIVED:
         - Ucapkan koordinat tersimpan dan informasikan kurir akan diarahkan ke titik itu. Jangan tampilkan detail order.
      3c) LOCATION_RECEIVED_CONFIRM — hanya untuk BUAT ORDER BARU (setelah pelanggan kirim koordinat lokasi):
         - Jika context.flags.confirm_address_same = true (pelanggan sudah pernah order, koordinat pernah tersimpan): Tanya apakah alamat antarnya masih sama seperti sebelumnya. Kalau sama dan detail pesanan sudah sesuai, balas *OK/Ya* untuk konfirmasi terakhir — baru pesanan kami proses dan carikan kurir. Kalau mau update koordinat, kirim lokasi lewat Clip 📎 -> Location. Natural.
         - Jika context.flags.confirm_address_same = false atau tidak ada (pelanggan BARU): Ucapkan terima kasih sudah kirim koordinat, sudah kami catat agar kurir tidak nyasar. Balas *OK/Ya* untuk konfirmasi terakhir ya kak, baru pesanan kami proses dan kami carikan kurirnya 😊. Jangan tanya "apakah alamat masih sama". Natural, tidak kaku.
      4) STATUS_WITH_LOCATION / STATUS_ONLY (role CUSTOMER):
         - Untuk PELANGGAN: jelaskan status order dengan kalimat untuk pelanggan (pesanan kamu sedang..., silakan ditunggu). JANGAN gunakan kalimat instruksi untuk kurir (mis. "kirim gambar nota struk ke saya", "silakan kirim struk belanja").
         - Total tagihan HANYA tampilkan jika context.flags.total_amount ada (sistem hanya mengisi ini saat status BILL_VALIDATION/BILL_SENT/COMPLETED). Jangan hitung atau tampilkan total dari harga item.
         - Jika show_details = true, WAJIB tampilkan detail order lengkap (item, pickup, antar, catatan) + Order ID dan Kode jika ada.
         - Jika show_details = false, jangan tampilkan detail order.
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
      --- KONTEKS: UPDATE ORDER BERJALAN (bukan buat order baru) ---
      Status 5, 5b dipakai saat pelanggan sedang UPDATE order yang sudah berjalan (bukan buat order baru).
      Tidak perlu minta update koordinat/alamat antar. Data update baru masuk ke database SETELAH pelanggan konfirmasi OK/Ya. Kalau pelanggan masih mau update lagi, silakan kabari → konfirmasi OK/Ya lagi → baru proses update berhasil dan masuk ke database. Natural, tidak kaku.

      5) ORDER_UPDATE_CONFIRMATION (CUSTOMER) — hanya untuk UPDATE ORDER BERJALAN:
         - JANGAN minta update koordinat atau kirim lokasi. Fokus ke konfirmasi update saja.
         - Format:
           "Siap kak 😊
            Update pesanan kami catat ya:
            {daftar update dalam bullet point dari context.update_items dan/atau context.update_notes}
            Tetap diantar ke {address} ya kak ✔️
            Kalau sudah sesuai, balas *OK/Ya* ya kak — baru kami simpan ke database dan infokan ke kurir 🙏
            Kalau masih mau ubah atau tambah lagi, tinggal kabari saja, nanti konfirmasi OK/Ya lagi ya."
         - WAJIB hanya tampilkan bullet point yang BENAR-BENAR ADA di context.update_items dan context.update_notes. JANGAN tambah atau asumsikan update lain (mis. jangan sebut "Update alamat pickup" jika tidak ada di context.update_items; jika pelanggan hanya kirim alamat antar, tampilkan hanya "Update alamat antar").
         - Gunakan context.update_items untuk bullet item (format item biasa). Jika hanya update_notes, tampilkan sebagai bullet "Catatan: {note}".
         - Jangan tampilkan detail order lengkap (items/pickup/antar/catatan) kecuali show_details = true.
         - Jika context.flags.address_update_blocked atau pickup_update_blocked = true, tambahkan kalimat singkat bahwa alamat pickup/antar tidak bisa diubah saat pesanan sedang berjalan.
      5b) ORDER_UPDATE_APPLIED — hanya untuk UPDATE ORDER BERJALAN (setelah pelanggan konfirmasi OK/Ya):
         - Jika role = CUSTOMER: Tampilkan ringkasan update saja (context.update_items / context.update_notes). Konfirmasi bahwa update sudah berhasil kami simpan ke database dan kurir sudah kami infokan. TANPA kalimat minta konfirmasi OK/Ya lagi. Natural. Jangan tampilkan detail order lengkap kecuali show_details = true.
         - Jika context.flags.address_update_blocked atau pickup_update_blocked = true, jelaskan singkat bahwa alamat pickup/antar tidak bisa diubah saat pesanan sedang berjalan.
         - Jika role = COURIER: "Halo rider, ada update pesanan order dari pelanggan nih! 😊" Lalu "Berikut detail ordernya saat ini:" — jika context.chat_messages ada, tampilkan "📋 Pesan order dari pelanggan:" dan list pesan; jika context.items ada, tampilkan 📦 Detail Pesanan, 📍 Pickup dari, 📍 Antar ke, Catatan. Akhiri dengan kalimat semangat dan hati-hati di jalan.
         - Sertakan Order ID dan Kode (context.order_id, context.short_code) jika ada.
      5c) ORDER_UPDATE_CANCELLED (CUSTOMER):
         - Dikirim saat pelanggan membatalkan update pesanan (tidak jadi update). JANGAN sertakan kalimat "Kurir masih dalam proses antar" atau "mohon ditunggu ya kak".
         - Sapa singkat, konfirmasi pesanan tidak jadi diupdate, lalu tutup dengan kalimat yang relevan dan natural (misal: "Kalau mau pesan lagi lain waktu, silakan kabari ya kak" atau "Terima kasih ya kak 😊").
         - Contoh gaya: "Siap kak 😊🙏 Pesanan tidak jadi kami proses ya. Kalau mau order lagi lain waktu, silakan kabari ya kak. Terima kasih!"
      5d) ORDER_CANCELLED (CUSTOMER):
         - Dikirim saat pelanggan membatalkan pesanan. WAJIB sertakan Order ID (context.order_id) dan Kode order (context.short_code) dalam balasan agar jelas dan tidak membingungkan.
         - Contoh gaya: "Sip kak 😊 Pesanan dengan Order ID *{order_id}* (Kode: *{short_code}*) sudah kami batalkan ya. Kalau mau order lagi lain waktu, silakan kabari ya kak. Terima kasih! 🙏"
         - Jika short_code tidak ada, tetap sebut order_id: "Pesanan dengan Order ID *{order_id}* sudah kami batalkan ya."
      6) ORDER_CONFIRMED:
         - Tampilkan konfirmasi proses, ringkasan order, dan info sedang mencari kurir. JANGAN minta konfirmasi lagi.
         - Jika context.order_id / context.short_code ada, sertakan di blok detail: "🆔 Order ID: {order_id} | Kode: {short_code}".
      6a) NO_COURIER_AVAILABLE (role CUSTOMER):
         - Dikirim saat pesanan sudah berhasil dibuat tapi tidak ada kurir yang tersedia (semua offline/sibuk/suspend).
         - Sapa dengan nama (kak {nama}), sampaikan bahwa saat ini semua kurir sedang offline atau sibuk. Gunakan kalimat natural dan hangat, tidak kaku.
         - Beri tahu bahwa pesanan tetap tercatat dan akan dicarikan kurir begitu ada yang tersedia. Ajak untuk sabar menunggu atau cek lagi sebentar lagi.
         - Contoh gaya: "Halo kak {nama} 😊 Pesanan kamu sudah kami catat ya. Sayangnya untuk saat ini semua kurir lagi offline/sibuk nih, jadi belum ada yang bisa kami tugaskan. Pesanan kamu tetap aman dan akan kami carikan kurir begitu ada yang ready. Mohon ditunggu sebentar ya kak, atau bisa cek lagi nanti dengan ketik *cek status order*. Terima kasih ya! 🙏"
         - Jangan tampilkan detail order (item/pickup/antar). Singkat, informatif, dan meyakinkan.
      7) UNKNOWN_COMMAND / NO_ACTIVE_ORDER / ASK_ITEMS / ASK_PICKUP / ASK_ADDRESS:
         - Jawab singkat dan jelas sesuai konteks. Respons harus nyambung dengan chat terakhir pelanggan; jangan ulangi kalimat yang sama dua kali.
         - Jika show_details = true (saat pelanggan buat order baru): WAJIB tampilkan ringkasan order yang sudah ada (item, pickup, antar — gunakan "-" atau "belum diisi" hanya jika kosong), sebut apa yang masih kurang, dan beri instruksi langkah berikutnya yang jelas.
         - ASK_PICKUP: Jika context.address juga kosong, sebutkan sekali saja "Yang masih kurang: alamat pickup dan alamat antar." Lalu satu kalimat instruksi: sebutkan alamat pickup dulu, lalu alamat antar; setelah itu balas OK/Ya. Jangan ucapkan "Setelah itu, balas OK/Ya..." berulang. Jika context.address sudah ada, cukup minta alamat pickup.
         - ASK_ADDRESS: Minta sebutkan alamat pengantaran. Satu kalimat instruksi singkat. Jika show_details, boleh sertakan ringkasan item; jangan duplikasi blok yang sama.
      7d) ORDER_IN_PROGRESS (CUSTOMER — pelanggan minta tambah/ubah order padahal punya order aktif):
         - Jika context.flags.order_update_blocked = true ATAU context.order_status = BILL_SENT atau COMPLETED: WAJIB balasan MENOLAK update dengan sopan. Jangan tampilkan "Pesanan kamu sudah kami catat" atau blok detail order seolah update diterima. Format: sapa (kak {nama}), lalu "Mohon maaf kak, saat ini orderan tidak bisa diupdate lagi karena " + alasan: jika BILL_SENT → "pesanan sudah dalam proses antar (kurir sedang menuju lokasi antar)."; jika COMPLETED → "pesanan sudah selesai." Tutup dengan kalimat ramah (mis. "Kalau mau pesan lagi, silakan order baru ya kak 😊").
         - Jika order_update_blocked = false (mis. ON_PROCESS/BILL_VALIDATION): boleh jelaskan bahwa pesanan sedang dalam proses dan tidak bisa diubah, singkat dan ramah. Jangan tampilkan detail order lengkap seolah update diterima.
      7a) ORDER_INTRO_ASK_DETAILS (role CUSTOMER):
         - Dikirim saat pelanggan mengirim intro/awalan untuk memesan (misal "halo mau pesen dong") tanpa detail item.
         - Sapa dengan nama (kak {nama}), lalu beri instruksi agar pelanggan menulis pesanan dengan lengkap: nama item, jumlah, dan harga per item (jika ada). Sebut juga bahwa setelah itu perlu alamat pickup dan alamat antar.
         - Gunakan kalimat natural dan ramah. Beri contoh format singkat (misal: Nasi Goreng 2 porsi 25rb, Es Teh 2 gelas 5rb).
         - Contoh gaya: "Halo kak {nama}! 😊 Silakan tuliskan pesanan kamu dengan lengkap ya: nama item, jumlah, dan harga per item (jika ada). Contoh: Nasi Goreng 2 porsi 25rb, Es Teh 2 gelas 5rb. Setelah itu sebut alamat pickup dan alamat antar ya kak."
      7b) POLITE_RESPONSE / CHITCHAT (role CUSTOMER):
         - Jika last_message berupa sapaan (pagi, siang, sore, malam, halo, hai): balas dengan sapaan balik (misal "Pagi kak! Ada yang bisa dibantu?", "Halo kak! Silakan ada yang bisa saya bantu atau mau pesan apa ka? 😊").
         - Jika berupa terima kasih (makasih, thanks): "Sama-sama kak! 😊"
      7c) TOTAL_NOT_READY:
         - Jawab singkat: total tagihan belum tersedia karena kurir belum selesai belanja / belum konfirmasi struk.
         - Tambahkan info bahwa total akan dikirim setelah kurir scan struk dan konfirmasi.
      8) OUT_OF_SCOPE:
         - Tolak sopan dan arahkan kembali ke topik MyJek/order.
      9) COURIER_ORDER_STATUS / COURIER_STATUS:
         - WAJIB gunakan context.order_status (dari response_spec) untuk memilih kalimat status. Jangan asumsikan atau default ke ON_PROCESS. Pilih TERJEMAH STATUS (COURIER) yang sesuai: ON_PROCESS → minta kirim struk; BILL_VALIDATION → menunggu konfirmasi total; BILL_SENT → "Belanja sudah selesai, lanjutkan ke alamat antar ya. ketik #SELESAI untuk menyelesaikan orderan jika orderan sudah sampai ke pelanggan."; COMPLETED → pesanan selesai.
         - Jelaskan status kurir dan jika ada order aktif, sebut status order + langkah selanjutnya sesuai order_status di atas.
         - Gunakan sudut pandang "kamu" dan jangan menyebut diri sebagai orang lain.
         - Penutup pesan WAJIB untuk kurir (bukan untuk pelanggan): ajakan lanjutkan tugas, hati-hati di jalan, semangat. Contoh: "Tetap semangat dan hati-hati di jalan ya!", "Silakan lanjutkan belanja lalu antar pesanannya.", "Lanjutkan ke lokasi antar ya." JANGAN gunakan penutup untuk pelanggan seperti "Silakan tunggu sebentar ya", "semoga semua berjalan lancar" (konteks menunggu).
         - Jika show_details = true, WAJIB tampilkan detail order lengkap (item, pickup, antar, catatan).
         - Total tagihan HANYA tampilkan jika context.flags.total_amount ada (sistem hanya mengisi saat status BILL_SENT/COMPLETED).
      10) COURIER_ALREADY_HAS_ORDER:
         - Tampilkan detail order aktif (item, pickup, antar, catatan) dan instruksi langkah berikutnya.
      11) SCAN_STARTED / SCAN_RESULT / SCAN_FAILED / SCAN_NOT_ALLOWED:
         - Gunakan bahasa kurir, ringkas, fokus pada total tagihan dan instruksi konfirmasi.
         - Jangan tampilkan detail order di tahap scan.
         - Khusus SCAN_RESULT: status ini HANYA dikirim SETELAH kurir mengirim gambar struk dan sistem sudah baca total. Balasan WAJIB sesuai konteks: (1) Konfirmasi struk sudah diproses, (2) Tampilkan total tagihan (gunakan context.flags.detected_total atau required_phrases), (3) Minta konfirmasi "Ketik OK/Y jika benar, atau ketik angka dari total tagihannya jika perlu revisi (Contoh: 540000)". JANGAN gunakan kalimat "Silakan kirim gambar nota struk ke saya" atau "Kamu sedang dalam proses belanja" di balasan SCAN_RESULT—itu untuk sebelum kurir kirim struk.
      11b) COURIER_IMAGE_REJECTED / INVALID_RECEIPT_IMAGE:
         - Dikirim saat kurir mengirim gambar atau file yang BUKAN struk belanja / tidak relevan dengan order MyJek.
         - Balasan singkat dan sopan: tolak gambar/file tersebut, jelaskan bahwa sistem hanya menerima foto struk belanja (yang memuat total tagihan) saat sedang dalam fase belanja order. Jika kurir tidak punya order aktif: jelaskan bahwa foto hanya diterima saat sedang mengerjakan order untuk kirim struk. Jangan kasar. Contoh: "Maaf ya, gambar yang dikirim bukan struk belanja yang valid atau total tagihan tidak terdeteksi. Silakan kirim foto struk belanja yang jelas dan memuat total harganya ya." atau "Maaf, foto/file hanya diterima saat kamu sedang mengerjakan order (fase belanja) untuk mengirim struk belanja. Silakan gunakan perintah yang tersedia ya."
      12) COURIER_ASSIGNED:
         - Format untuk pelanggan (order ditugaskan ke kurir): Sapa (kak {nama_pelanggan}), sampaikan pesanan sudah ditugaskan ke kurir. Sertakan Order ID dan Kode jika ada. Lalu: jika context.chat_messages ada, tampilkan "📋 Pesan order kamu:" dan list pesan; jika context.items/pickup/address ada, tampilkan 📦 Detail Pesanan, 📍 Pickup dari, 📍 Antar ke, Catatan. Lalu Nama Kurir, Nomor HP Kurir, kalimat tunggu kurir. Akhiri dengan Catatan #HUMAN.
         - Gunakan context.order_id, context.short_code, context.courier_name, context.courier_phone, context.user_name. Untuk isi order: context.chat_messages (array) atau context.items, context.pickup, context.address, context.notes.
      13) BILL_UPDATED / BILL_CONFIRM_PROMPT:
         - Jawaban singkat: tampilkan total terbaru dan minta konfirmasi (OK/Y) atau revisi angka.
         - Jangan tampilkan detail order.
      14) ORDER_COMPLETED (CUSTOMER):
         - Jawaban singkat: "Orderan sudah sampai yah kak, terima kasih banyak, ditunggu orderan selanjutnya yah kak 😃🙏."
      15) BILL_SENT_TO_CUSTOMER / BILL_CONFIRMED: 
         - Untuk BILL_SENT_TO_CUSTOMER: WAJIB tampilkan total tagihan + ringkasan detail order + info pembayaran singkat dan tidak perlu customer tidak perlu konfirmasi.
         - Untuk BILL_CONFIRMED (kurir): jawaban singkat berisi total tagihan terkonfirmasi dan kalimat "Sekarang kamu bisa melanjutkan pengantaran pesanan." (JANGAN pakai "ke alamat berikut:"—langsung tampilkan detail order di bawahnya).
         - Jangan meminta konfirmasi pembayaran.
      16) ORDER_COMPLETED_COURIER:
         - Beri ucapan semangat, info order selesai, dan bahwa kamu siap ambil order baru.
         - Contoh: "Terima kasih! Order sudah selesai. Status kamu sekarang IDLE (ONLINE), siap ambil order berikutnya ya 😊."
      17) COURIER_LOCATION_UPDATED:
         - Konfirmasi lokasi tersimpan dan ucapkan terima kasih dan terus berhati-hati di jalan ya, semoga sehat terus. Jangan minta lokasi pelanggan.
      18) ORDER_TAKEN:
         - Format WAJIB (termasuk saat kurir ambil order atau admin menugaskan):
           Baris pertama: "Pesanan sudah kamu ambil ✅"
           Lalu: "👤 Pelanggan: {nama_pelanggan}" dan "📱 Nomor HP Pelanggan: {nomor_pelanggan}" (WAJIB dari context).
           Lalu salah satu: (A) Jika context.chat_messages ada (array): "📋 Pesan order dari pelanggan:" lalu tiap pesan sebagai baris; (B) Jika context.items ada: "📦 Detail Pesanan:", daftar item, "📍 Pickup dari:", "📍 Antar ke:", "Catatan:" seperti biasa.
           Lalu: kalimat singkat agar kurir bisa kontak pelanggan langsung; jika belum update lokasi, minta update koordinat (Clip 📎 -> Location). Penutup: Terima kasih semangat + Catatan #HUMAN.
         - Gunakan context.user_name / context.flags.customer_name untuk nama, context.user_phone / context.flags.customer_phone untuk nomor. WAJIB sertakan Catatan #HUMAN di akhir.
      19) COURIER_ORDER_STATUS (role COURIER):
         - KRITIKAL: Bagian (1) WAJIB sesuai context.order_status. Gunakan TERJEMAH STATUS (COURIER) untuk nilai order_status tersebut saja. Jika order_status = BILL_SENT jangan pakai kalimat ON_PROCESS (minta struk). Jika order_status = ON_PROCESS baru pakai kalimat minta struk.
         - Format balasan WAJIB: (1) Kalimat status + langkah selanjutnya LENGKAP sesuai order_status, (2) "Berikut detail ordernya:", (3) blok detail order LENGKAP, (4) penutup untuk kurir.
         - Contoh (1) sesuai status: ON_PROCESS → "Kamu sedang dalam proses belanja. Silakan kirim gambar nota struk..."; BILL_VALIDATION → "Menunggu konfirmasi total tagihan."; BILL_SENT → "Belanja sudah selesai, lanjutkan ke alamat antar ya. ketik #SELESAI untuk menyelesaikan orderan jika orderan sudah sampai ke pelanggan."
         - WAJIB sertakan detail order: 🆔 Order ID | Kode, 📦 Detail Pesanan, 📍 Pickup dari, 📍 Antar ke, Catatan (jika ada). Awali blok detail dengan "Berikut detail ordernya:".
         - Penutup WAJIB untuk kurir (mis. "Tetap semangat dan hati-hati di jalan ya!"). JANGAN gunakan penutup untuk pelanggan.

      ATURAN FORMAT ITEM:
      - Gunakan format: "- {item} (x{qty})" jika tidak ada note; jika ada note gunakan "- {item} (x{qty}) - {note}" (wajib spasi dan strip "- " sebelum note agar terbaca rapi).
      - Jangan duplikasi harga: jika note sudah berisi "harga 10rb" / "10rb" / "15k", JANGAN tambahkan lagi "Harga: Rp...". Tampilkan harga hanya sekali (dalam note saja).
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
      - SCAN_RESULT = kurir baru saja mengirim gambar struk dan sistem sudah baca total. Konteks: struk sudah diproses, bukan minta kirim struk.
      - WAJIB tampilkan total tagihan yang terdeteksi (dari context.flags.detected_total atau required_phrases). Format: "Total tagihan yang terdeteksi adalah Rp{angka}."
      - WAJIB minta konfirmasi: "Ketik OK/Y jika benar, atau ketik angka dari total tagihannya jika perlu revisi (Contoh: 540000)."
      - JANGAN sertakan "Silakan kirim gambar nota struk" atau "Kamu sedang dalam proses belanja" di balasan SCAN_RESULT.

      ATURAN KHUSUS STATUS_WITH_LOCATION / STATUS_ONLY / TOTAL_STATUS (CUSTOMER):
      - WAJIB gunakan context.order_status (atau context.flags.status) untuk memilih kalimat status. Jangan asumsikan status. BILL_SENT → "belanja sudah selesai, sekarang kurir sedang menuju alamat antar"; ON_PROCESS → "Pesanan kamu sedang dibelanjakan oleh kurir"; BILL_VALIDATION → "menunggu konfirmasi total tagihan dari kurir"; LOOKING_FOR_DRIVER → "sedang dicarikan kurir".
      - Sertakan info bahwa user/kurir bisa klik lokasi untuk melihat posisi terkini.
      - Jika role = CUSTOMER: gunakan TERJEMAH STATUS untuk CUSTOMER. Jangan sertakan instruksi untuk kurir (mis. "kirim gambar nota struk ke saya", "silakan kirim struk belanja pelanggan").
      - Jika role = COURIER: gunakan TERJEMAH STATUS untuk COURIER (instruksi untuk kurir).

      TERJEMAH STATUS (gunakan kalimat natural, jangan sebut kode). BEDAKAN PELANGGAN vs KURIR:
      - LOOKING_FOR_DRIVER: (CUSTOMER) "sedang dicarikan kurir disekitar kamu"; (COURIER) sama.
      - ON_PROCESS: (CUSTOMER) "Pesanan kamu sedang dibelanjakan oleh kurir. Silakan ditunggu ya kak." JANGAN pakai kalimat minta struk/nota. (COURIER) "Kamu sedang dalam proses belanja. Silakan kirim gambar nota struk belanja ke saya setelah selesai belanja ya, saya akan bantu baca total tagihannya."
      - BILL_VALIDATION: (CUSTOMER) "menunggu konfirmasi total tagihan dari kurir"; (COURIER) "menunggu konfirmasi total tagihan."
      - BILL_SENT: (CUSTOMER) "belanja sudah selesai kak, sekarang kurir sedang menuju alamat antar ya kak"; (COURIER) "Belanja sudah selesai, lanjutkan ke alamat antar ya. ketik #SELESAI untuk menyelesaikan orderan jika orderan sudah sampai ke pelanggan."
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
      return res?.ai_reply || res?.reply || "Siap kak, ada yang bisa dibantu kak? 😊";
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

    const orderStatus = responseSpec?.context?.order_status;
    const flags = responseSpec?.context?.flags || {};
    if (
      role === "CUSTOMER" &&
      responseSpec?.status === "ORDER_IN_PROGRESS" &&
      flags.order_update_blocked &&
      /(Pesanan kamu sudah kami catat|Pesanan kami catat|Berikut detail pesanan)/i.test(reply)
    ) {
      const reason =
        orderStatus === "COMPLETED"
          ? "pesanan sudah selesai."
          : "pesanan sudah dalam proses antar (kurir sedang menuju lokasi antar).";
      const strictPrompt = `${SYSTEM_PROMPT}\n\nSTRICT OVERRIDE: response_spec.status = ORDER_IN_PROGRESS dan context.flags.order_update_blocked = true. Pelanggan minta tambah/ubah order tapi TIDAK BISA. WAJIB balas MENOLAK dengan sopan: sapa (kak {nama}), "Mohon maaf kak, saat ini orderan tidak bisa diupdate lagi karena ${reason}" lalu tutup ramah (mis. "Kalau mau pesan lagi, silakan order baru ya kak 😊"). JANGAN tulis "Pesanan kamu sudah kami catat" atau tampilkan detail order seolah update diterima.`;
      const retry = await this.adapter.generateResponse(
        strictPrompt,
        JSON.stringify(userPayload),
        { response_spec: responseSpec },
      );
      reply = extractReply(retry);
    }

    if (
      role === "COURIER" &&
      (responseSpec?.status === "COURIER_ORDER_STATUS" || responseSpec?.status === "COURIER_STATUS") &&
      ["BILL_SENT", "BILL_VALIDATION", "COMPLETED"].includes(orderStatus) &&
      /(silakan kirim gambar|proses belanja|kirim gambar nota struk)/i.test(reply)
    ) {
      const statusPhrase =
        orderStatus === "BILL_SENT"
          ? "Belanja sudah selesai, lanjutkan ke alamat antar ya. ketik #SELESAI untuk menyelesaikan orderan jika orderan sudah sampai ke pelanggan."
          : orderStatus === "BILL_VALIDATION"
            ? "Menunggu konfirmasi total tagihan."
            : "Pesanan sudah selesai.";
      const strictPrompt = `${SYSTEM_PROMPT}\n\nSTRICT OVERRIDE: response_spec.status = COURIER_ORDER_STATUS dan context.order_status = ${orderStatus}. JANGAN gunakan kalimat "Kamu sedang dalam proses belanja" atau "Silakan kirim gambar nota struk". Untuk ${orderStatus} WAJIB gunakan: "${statusPhrase}" (atau padanannya).`;
      const retry = await this.adapter.generateResponse(
        strictPrompt,
        JSON.stringify(userPayload),
        { response_spec: responseSpec },
      );
      reply = extractReply(retry);
    }

    if (
      role === "CUSTOMER" &&
      responseSpec?.status === "REQUEST_LOCATION" &&
      /(alamat antarnya masih sama|Konfirmasi dulu ya)/i.test(reply)
    ) {
      const strictPrompt = `${SYSTEM_PROMPT}\n\nSTRICT OVERRIDE: response_spec.status = REQUEST_LOCATION = pelanggan BARU (belum pernah kirim koordinat). JANGAN gunakan "apakah alamat antarnya masih sama" atau "Konfirmasi dulu ya". WAJIB gunakan balasan untuk pelanggan baru: "Halo kak {nama}, silahkan kirimkan lokasi koordinat titik alamat antarnya yah kak dengan cara klik tombol Clip (📎) di WA -> Pilih Location -> Send Your Current Location, agar kurirnya nanti tidak nyasar hehe 😅🙏."`;
      const retry = await this.adapter.generateResponse(
        strictPrompt,
        JSON.stringify(userPayload),
        { response_spec: responseSpec },
      );
      reply = extractReply(retry);
    }

    if (
      role === "COURIER" &&
      responseSpec?.status === "SCAN_RESULT" &&
      (/silakan kirim gambar|proses belanja|kirim gambar nota struk/i.test(reply) ||
        !/Rp\s*[\d.,]+/i.test(reply))
    ) {
      const totalPhrase =
        responseSpec?.required_phrases?.find((p) => /Total tagihan yang terdeteksi/i.test(p)) ||
        (responseSpec?.context?.flags?.detected_total != null
          ? `Total tagihan yang terdeteksi adalah Rp${Number(responseSpec.context.flags.detected_total).toLocaleString("id-ID")}.`
          : "");
      const strictPrompt = `${SYSTEM_PROMPT}\n\nSTRICT OVERRIDE: response_spec.status = SCAN_RESULT. Kurir BARU SAJA mengirim struk dan sistem sudah baca total. Balasan WAJIB: (1) Konfirmasi struk sudah diproses, (2) Tampilkan total: ${totalPhrase || "gunakan required_phrases atau context.flags.detected_total"}, (3) Minta konfirmasi "Ketik OK/Y jika benar, atau ketik angka jika perlu revisi". JANGAN tulis "Silakan kirim gambar struk" atau "Kamu sedang dalam proses belanja"—itu untuk SEBELUM struk dikirim.`;
      const retry = await this.adapter.generateResponse(
        strictPrompt,
        JSON.stringify(userPayload),
        { response_spec: responseSpec },
      );
      reply = extractReply(retry);
    }

    const ORDER_STATUSES_WITH_HUMAN_FOOTNOTE = [
      "PENDING_CONFIRMATION",
      "LOOKING_FOR_DRIVER",
      "ON_PROCESS",
      "BILL_VALIDATION",
      "BILL_SENT",
      "COMPLETED",
      "CANCELLED",
    ];
    const showHumanFootnote = orderStatus && ORDER_STATUSES_WITH_HUMAN_FOOTNOTE.includes(orderStatus);
    const statusAlreadyHasHumanNote =
      responseSpec?.status === "COURIER_ASSIGNED" || responseSpec?.status === "ORDER_TAKEN";
    // Format untuk WhatsApp: dua baris kosong (enter 2x) lalu teks miring. WhatsApp mendukung _teks_ untuk italic.
    const HUMAN_MODE_FOOTNOTE_CUSTOMER =
      "\n\n\n_Catatan: jika saya salah dalam memahami maksud kakak atau terdapat komplain/masalah tentang proses order, silahkan ketik #HUMAN untuk beralih ke human mode, nanti akan ada admin yang chat kakak ya, mohon maaf sebelumnya kak 😅🙏_";
    const HUMAN_MODE_FOOTNOTE_COURIER =
      "\n\n\n_Catatan: jika ada kendala atau komplain, ketik #HUMAN untuk beralih ke human mode ya, nanti admin yang akan bantu._";

    if (statusAlreadyHasHumanNote && typeof reply === "string" && reply.trim()) {
      // COURIER_ASSIGNED / ORDER_TAKEN: AI sudah sertakan Catatan #HUMAN tapi format sering tidak terbaca (enter 2x + miring). Hapus versi AI lalu tambahkan footnote berformat tetap.
      reply = reply.replace(/\s*Catatan:.*#HUMAN.*$/im, "").trimEnd();
      if (role === "CUSTOMER") reply = reply.trimEnd() + HUMAN_MODE_FOOTNOTE_CUSTOMER;
      else if (role === "COURIER") reply = reply.trimEnd() + HUMAN_MODE_FOOTNOTE_COURIER;
    } else if (
      showHumanFootnote &&
      role === "CUSTOMER" &&
      typeof reply === "string" &&
      reply.trim()
    ) {
      reply = reply.trimEnd() + HUMAN_MODE_FOOTNOTE_CUSTOMER;
    } else if (
      showHumanFootnote &&
      role === "COURIER" &&
      typeof reply === "string" &&
      reply.trim()
    ) {
      reply = reply.trimEnd() + HUMAN_MODE_FOOTNOTE_COURIER;
    }

    // Post-process: hapus baris duplikat "Alamat pengantaran" jika sudah ada "Alamat antar" (alamat cukup sekali)
    const summaryStatuses = [
      "ORDER_DRAFT_SUMMARY",
      "ORDER_SUMMARY",
      "ORDER_SUMMARY_NEED_LOCATION",
      "ORDER_SUMMARY_ADDRESS_UPDATED",
    ];
    if (
      role === "CUSTOMER" &&
      summaryStatuses.includes(responseSpec?.status) &&
      typeof reply === "string" &&
      /Alamat antar:/i.test(reply)
    ) {
      reply = reply
        .split(/\r?\n/)
        .filter((line) => !/^\s*📍?\s*Alamat pengantaran\s*:/i.test(line.trim()))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
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

  /**
   * Rekomendasi tempat dinamis: AI memilih tempat yang sesuai kebutuhan pelanggan dari daftar resmi,
   * lalu memformat balasan yang rapi. Jika AI gagal/format salah, fallback tetap mengirim list.
   */
  async generatePlaceRecommendationReply(places, userMessage = "", userName = "kak") {
    const name = userName && userName !== "Pelanggan" ? userName : "kak";
    if (!places || !places.length) {
      return `Maaf kak ${name}, data rekomendasi tempat sedang tidak tersedia. Silakan coba lagi atau ketik #HUMAN untuk bantuan admin 🙏`;
    }

    const parseJsonMaybe = (value) => {
      if (typeof value !== "string") return null;
      const s = value.trim();
      if (!s.startsWith("{") || !s.endsWith("}")) return null;
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    const inferWantedType = (text) => {
      const t = String(text || "").toLowerCase();
      if (/(wisata|pantai|gunung|air terjun|spot|view|sunset|liburan|tour|turis)/i.test(t))
        return "wisata";
      if (/(kopi|cafe|kafe|nongkrong|minum|coffee|espresso|latte|matcha|boba)/i.test(t))
        return "minum";
      if (/(makan|resto|restoran|rm |rumah makan|kuliner|nasi|ayam|ikan|seafood|sate)/i.test(t))
        return "makan";
      return "mixed";
    };

    const normalize = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const inferWantedArea = (text) => {
      const t = normalize(text);
      if (!t) return null;

      // area candidates berasal dari catalog (dinamis), bukan hardcode
      const areaCandidates = Array.from(
        new Set(
          (places || [])
            .map((p) => p?.area)
            .filter(Boolean)
            .map((a) => String(a).trim())
            .filter((a) => a.length > 1)
        )
      );

      // match direct "contains"
      const direct = areaCandidates.find((a) => t.includes(normalize(a)));
      if (direct) return direct;

      // match kata setelah "di/sekitar/area/wilayah"
      const m = t.match(/\b(di|sekitar|area|wilayah)\s+([a-z0-9 .'-]{3,40})/i);
      const hint = m?.[2] ? normalize(m[2]) : "";
      if (hint) {
        const fuzzy = areaCandidates.find((a) => normalize(a).includes(hint) || hint.includes(normalize(a)));
        if (fuzzy) return fuzzy;
      }

      return null;
    };

    const pickPlacesFallback = () => {
      const wanted = inferWantedType(userMessage);
      const wantedArea = inferWantedArea(userMessage);
      const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const pool = wantedArea
        ? places.filter((p) => normalize(p?.area) === normalize(wantedArea))
        : places;
      const byType = (type) =>
        shuffle(pool.filter((p) => String(p?.type || "").toLowerCase() === type));
      let picked = [];

      if (wanted === "mixed") {
        picked = [
          ...byType("makan").slice(0, 6),
          ...byType("minum").slice(0, 4),
          ...byType("wisata").slice(0, 4),
        ];
      } else {
        picked = byType(wanted).slice(0, 12);
        if (picked.length < 10) {
          const others = shuffle(pool.filter((p) => !picked.includes(p))).slice(
            0,
            15 - picked.length
          );
          picked = [...picked, ...others];
        }
      }

      if (picked.length > 15) picked = picked.slice(0, 15);
      // kalau area spesifik tapi datanya sedikit, lengkapi dari catalog global
      if (picked.length < 10) {
        const filler = shuffle(places.filter((p) => !picked.includes(p))).slice(0, 15 - picked.length);
        picked = [...picked, ...filler].slice(0, Math.min(15, places.length));
      }
      return picked;
    };

    const formatPlacesReply = (picked) => {
      const intro = `Siap kak ${name}, ini beberapa tempat yang rekomen di Sumbawa:`;
      const list = picked
        .filter(Boolean)
        .slice(0, 15)
        .map((p) => {
          const type = String(p.type || "").toLowerCase();
          const label = type === "wisata" ? "🏝️" : type === "minum" ? "☕" : "🍽️";
          const title = p.name ? `${label} *${p.name}*` : `${label} *Rekomendasi*`;
          const area = p.area ? ` (${p.area})` : "";
          const desc = p.description ? `\n${p.description}` : "";
          const map = p.mapUrl ? `\n🗺️ Peta: ${p.mapUrl}` : "";
          return `${title}${area}${desc}${map}`;
        })
        .join("\n\n");

      return (
        `${intro}\n\n` +
        `📍 *Daftar rekomendasi:*\n\n` +
        `${list}\n\n` +
        `Silakan klik link peta untuk melihat lokasi. Kalau mau pesan antar ke salah satu tempat ini, bisa order lewat chat ya kak 🙏`
      );
    };

    const wantedArea = inferWantedArea(userMessage);
    const systemPrompt = `
ROLE: Asisten MyJek (layanan ojek & kurir di Sumbawa).
Tugas: Berikan rekomendasi tempat makan/minum/wisata di Pulau Sumbawa berdasarkan pertanyaan pelanggan.

DATA TEMPAT (WAJIB pilih HANYA dari list ini):
${JSON.stringify(places, null, 0)}

ATURAN:
1. Pilih 10–15 tempat yang paling sesuai kebutuhan pelanggan.
   - Jika pelanggan menyebut wilayah/area tertentu, PRIORITASKAN tempat di area itu. Area diminta: ${wantedArea ? `"${wantedArea}"` : "(tidak spesifik)"}.
2. Untuk setiap tempat: gunakan persis name, description, area, mapUrl dari data (jangan ubah URL).
3. Format WhatsApp rapi: emoji kategori, nama, area, deskripsi singkat, dan mapUrl di baris terpisah. Pisahkan antar tempat dengan baris kosong.
4. Usahakan variasi rekomendasi (tidak selalu urutan yang sama) selama tetap memilih dari data.
5. Akhiri 1 kalimat ajakan klik link peta + bisa order lewat chat.
6. Output HANYA JSON: { "reply": "..." }.
`;

    try {
      const result = await this.adapter.generateResponse(
        systemPrompt,
        `Pertanyaan pelanggan: "${userMessage}". Nama panggilan: ${name}.`,
        { placesCount: places.length, userName: name }
      );
      const parsed = parseJsonMaybe(result);
      const reply = parsed?.reply || result?.reply || result;
      if (typeof reply === "string" && reply.trim()) {
        const looksLikeList =
          /🗺️\s*Peta:/i.test(reply) ||
          /📍\s*\*Daftar rekomendasi/i.test(reply) ||
          /🍽️|☕|🏝️/.test(reply);
        if (looksLikeList) return reply.trim();
      }
    } catch (e) {
      console.error("generatePlaceRecommendationReply error:", e.message);
    }

    return formatPlacesReply(pickPlacesFallback());
  }
}

export const aiService = new AIService();