/**
 * Template pesan chatbot — satu sumber agar tidak duplikat dan konsisten.
 */

const FEEDBACK_URL = "https://bit.ly/feedbacklayananmyjek";
const HUMAN_HANDOFF_NOTE =
  "💬 Ketik #HUMAN jika ingin berbicara langsung dengan tim kami.";

/**
 * Pesan tagihan ke pelanggan setelah struk dikonfirmasi kurir (BILL_SENT).
 * @param {string} totalRupiah - Format "Rp. 50.000" (sudah di-format)
 * @param {string} strukLink - URL download gambar struk (Minio/dll)
 */
export function billSentToCustomer(totalRupiah, strukLink) {
  return (
    `📦 Kami infokan tagihan Anda berikut ini yaa! 🙏😊\n` +
    `- Total Tagihan: ${totalRupiah}\n` +
    `- Silahkan download struk belanja-nya melalui link berikut: ${strukLink || "(link tidak tersedia)"}\n\n` +
    `Mohon standby-kan HP-nya, Rider kami akan segera menuju lokasi 🚀\n\n` +
    `🎯 Bantu kami meningkatkan layanan!\n` +
    `Silakan beri rating Rider/Admin dan/atau sampaikan keluhan (jika ada) lewat link berikut:\n` +
    `👉 ${FEEDBACK_URL}\n\n` +
    `📬 Respon Anda bersifat anonim dan hanya akan dibaca oleh tim pusat MyJek.\n\n` +
    `Terima kasih sudah menggunakan MyJek💛\n\n` +
    HUMAN_HANDOFF_NOTE
  );
}

/**
 * Pesan ke kurir saat admin menugaskan order (assign) — hanya pakai chat_messages.
 */
export function courierAssignedByAdmin(courierName, customerName, customerPhone, chatMessages = []) {
  const lines = Array.isArray(chatMessages)
    ? chatMessages.map((m) => (typeof m === "string" ? m : m?.body ?? String(m)).trim()).filter(Boolean)
    : [];
  const block = lines.length > 0
    ? "📋 *Pesan order dari pelanggan:*\n\n" + lines.map((l) => `- ${l}`).join("\n")
    : "📋 Pesan order dari pelanggan: (tidak ada pesan)";
  return (
    "Pesanan sudah kamu ambil ✅\n\n" +
    `👤 Pelanggan: ${customerName || "Pelanggan"}\n` +
    `📱 Nomor HP Pelanggan: ${customerPhone || "-"}\n\n` +
    block +
    "\n\nSilakan kontak pelanggan langsung jika ada yang perlu ditanyakan. Jangan lupa update lokasi jika belum. Terima kasih, semangat!\n\n" +
    "_Catatan: jika ada kendala atau komplain, ketik #HUMAN untuk beralih ke human mode ya, nanti admin yang akan bantu._"
  );
}

/**
 * Pesan ke pelanggan saat admin menugaskan kurir — hanya pakai chat_messages.
 */
export function customerCourierAssignedByAdmin(userName, orderId, shortCode, courierName, courierPhone, chatMessages = []) {
  const lines = Array.isArray(chatMessages)
    ? chatMessages.map((m) => (typeof m === "string" ? m : m?.body ?? String(m)).trim()).filter(Boolean)
    : [];
  const block = lines.length > 0
    ? "📋 *Pesan order kamu:*\n\n" + lines.map((l) => `- ${l}`).join("\n")
    : "";
  return (
    `Halo kak ${userName || "Pelanggan"} 😊 Pesanan kamu sudah ditugaskan ke kurir.\n\n` +
    `🆔 Order ID: ${orderId || "-"} | Kode: ${shortCode || "-"}\n\n` +
    (block ? block + "\n\n" : "") +
    `👤 Nama Kurir: ${courierName || "Kurir"}\n` +
    `📱 Nomor HP Kurir: ${courierPhone || "-"}\n\n` +
    "Silakan tunggu kurir ya kak! 😊\n\n" +
    "_Catatan: jika saya salah dalam memahami maksud kakak atau terdapat komplain/masalah tentang proses order, silahkan ketik #HUMAN untuk beralih ke human mode, nanti akan ada admin yang chat kakak ya, mohon maaf sebelumnya kak 😅🙏_"
  );
}

export { HUMAN_HANDOFF_NOTE, FEEDBACK_URL };
