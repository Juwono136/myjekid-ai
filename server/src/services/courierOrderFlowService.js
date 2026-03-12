/**
 * Alur kurir: struk (scan gambar), konfirmasi total, #SELESAI.
 * Dipanggil dari webhook ketika pengirim adalah kurir dengan current_order_id.
 */
import { Order, User } from "../models/index.js";
import { orderService } from "./orderService.js";
import { messageService } from "./messageService.js";
import { aiService } from "./ai/AIService.js";
import { storageService } from "./storageService.js";
import { billSentToCustomer } from "../constants/messageTemplates.js";

const MINIO_PUBLIC_BASE =
  process.env.MINIO_PUBLIC_BASE_URL || "https://s3-storage.mmsdashboard.dev/myjek-invoices";

/**
 * Kurir kirim gambar struk:
 * - ON_PROCESS: scan pertama.
 * - BILL_VALIDATION: boleh kirim ulang untuk replace struk + re-scan total.
 */
export async function handleCourierStrukImage(courier, order, imageUrlOrBase64) {
  if (!["ON_PROCESS", "BILL_VALIDATION"].includes(order.status)) return null;
  if (!imageUrlOrBase64) return null;

  try {
    const filename = `struk-${order.order_id}-${Date.now()}.jpg`;
    let uploadedFilename = null;
    if (String(imageUrlOrBase64).startsWith("http")) {
      uploadedFilename = await storageService.uploadFileFromUrl(imageUrlOrBase64, filename);
    } else {
      uploadedFilename = await storageService.uploadBase64(imageUrlOrBase64, filename);
    }
    if (!uploadedFilename) {
      return "Gagal menyimpan gambar struk. Silakan coba kirim ulang foto struk yang jelas.";
    }

    const { total } = await aiService.readInvoice(imageUrlOrBase64, order.chat_messages || []);
    await orderService.saveBillDraft(order.order_id, total, uploadedFilename);

    const rupiah = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(total || 0);
    return (
      `Total tagihan yang terdeteksi adalah ${rupiah}.\n\n` +
      `Ketik *OK* atau *Ya* jika benar, atau ketik angka total tagihan yang benar jika perlu revisi (contoh: 540000).`
    );
  } catch (err) {
    console.error("handleCourierStrukImage error:", err);
    return "Maaf, gagal memproses gambar struk. Silakan kirim ulang foto struk yang jelas memuat total tagihan.";
  }
}

/**
 * Kurir ketik angka untuk revisi total (BILL_VALIDATION): update draft, minta konfirmasi lagi.
 * @param {string} amountText - teks dari chat, e.g. "81000" atau "81.000"
 * @returns {Promise<string|null>} pesan balasan atau null
 */
export async function handleCourierReviseBill(courier, order, amountText) {
  if (order.status !== "BILL_VALIDATION") return null;
  const cleaned = String(amountText || "").replace(/\s/g, "").replace(/\./g, "").replace(/,/g, "");
  const num = parseInt(cleaned, 10);
  if (!Number.isFinite(num) || num < 0) return null;
  const updated = await orderService.saveBillDraft(
    order.order_id,
    num,
    order.invoice_image_url || ""
  );
  if (!updated) return null;
  const rupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(num);
  return (
    `Total tagihan diupdate ke ${rupiah}.\n\n` +
    `Ketik *OK* atau *Ya* jika benar, atau ketik angka total tagihan yang benar jika perlu revisi (contoh: 540000).`
  );
}

/**
 * Kurir konfirmasi total (ok/ya) saat BILL_VALIDATION: finalizeBill, kirim tagihan ke pelanggan, balas ke kurir.
 */
export async function handleCourierConfirmBill(courier, order) {
  if (order.status !== "BILL_VALIDATION") return null;

  const updated = await orderService.finalizeBill(order.order_id);
  if (!updated) return null;

  const customerPhone = order.user_phone || updated.user_phone;
  const totalRupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(updated.total_amount || 0));
  const strukLink = updated.invoice_image_url
    ? `${MINIO_PUBLIC_BASE}/${updated.invoice_image_url}`
    : "";

  if (customerPhone && String(customerPhone).startsWith("62")) {
    try {
      await messageService.sendMessage(customerPhone, billSentToCustomer(totalRupiah, strukLink));
    } catch (e) {
      console.error("Failed to send bill to customer:", e.message);
    }
  }

  return "Total tagihan sudah dikonfirmasi dan sudah kami kirim ke pelanggan. Silakan lanjutkan pengantaran. Ketik *#SELESAI* ketika order sudah sampai ke pelanggan.";
}

/**
 * Kurir ketik #SELESAI (order BILL_SENT): completeOrder, notifikasi ke kurir dan pelanggan.
 */
export async function handleCourierSelesai(courier, order) {
  if (order.status !== "BILL_SENT") return null;

  const ok = await orderService.completeOrder(order.order_id, courier.id);
  if (!ok) return null;

  const courierMsg =
    "Terima kasih! Order sudah selesai. Status kamu sekarang IDLE (online), siap ambil order berikutnya ya 😊.";
  const customerMsg =
    "Orderan sudah sampai yah kak, terima kasih banyak, ditunggu orderan selanjutnya yah kak 😃🙏";

  const customerPhone = order.user_phone;
  try {
    if (customerPhone && String(customerPhone).startsWith("62")) {
      await messageService.sendMessage(customerPhone, customerMsg);
    }
  } catch (e) {
    console.error("Failed to send completion message to customer:", e.message);
  }
  // Balasan ke kurir dikirim sekali lewat return (webhook/reply), jangan kirim lagi di sini agar tidak double
  return courierMsg;
}
