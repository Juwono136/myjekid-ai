import { Op } from "sequelize";
import { redisClient } from "../../config/redisClient.js";
import { orderService } from "../orderService.js";
import { messageService } from "../messageService.js";
import { Order, Courier } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";
import { dispatchService } from "../dispatchService.js";
import { sanitizePhoneNumber } from "../../utils/formatter.js";
import { storageService } from "../storageService.js";

const toIDR = (num) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(num);

const getDashboardReply = (courier) => {
  const statusIcon = courier.status === "IDLE" ? "🟢" : courier.status === "BUSY" ? "🔴" : "⚫";

  return (
    `🏢 *DASHBOARD KURIR MYJEK*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Nama : ${courier.name}\n` +
    `📡 Status : ${statusIcon} *${courier.status}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `*Menu Perintah:*\n` +
    `▶️ *#SIAP* : Aktifkan Akun (On-Bid)\n` +
    `⏸️ *#OFF* : Matikan Akun (Istirahat)\n` +
    `➡️ *#INFO* : Cek Status Kurir Saat ini\n\n` +
    `_Tetap semangat & hati-hati di jalan!_ 💪`
  );
};

// FINALISASI TAGIHAN
const executeBillFinalization = async (courierId, orderId) => {
  const order = await orderService.finalizeBill(orderId);
  if (!order) return null;

  // Notifikasi ke Customer (TEXT ONLY - Agar Aman & Profesional)
  // Informasikan bahwa nota akan dikirim manual oleh driver
  const captionUser =
    `Halo Kak! 👋\n` +
    `Belanjaan sudah selesai dibeli.\n\n` +
    `💰 Total Tagihan Final: *${toIDR(order.total_amount)}*\n` +
    `_(Sudah termasuk ongkir & jasa titip)_\n\n` +
    `📸 *INFO PENTING:*\n` +
    `Driver kami akan mengirimkan *FOTO NOTA ASLI* melalui Personal Chat (WA Pribadi) ke nomor kakak sebentar lagi. Mohon diperiksa ya.\n\n` +
    `Mohon siapkan uang pas, Driver segera meluncur! 🛵`;

  // Gunakan sendMessage (Text), bukan sendImage agar stabil
  await messageService.sendMessage(order.user_phone, captionUser);

  // Balasan ke Kurir (Instruksi Manual)
  return (
    `✅ *TAGIHAN TERKONFIRMASI!*\n` +
    `Nominal: ${toIDR(order.total_amount)}\n\n` +
    `⚠️ *TUGAS WAJIB SEKARANG:*\n` +
    `1. *Chat WA Manual* ke Customer sekarang.\n` +
    `2. *Kirim FOTO STRUK/NOTA* belanjaan ke mereka sebagai bukti sah.\n` +
    `3. Antar pesanan ke: *${order.delivery_address}*\n\n` +
    `👉 Ketik *#SELESAI* jika barang sudah diterima customer.`
  );
};

export const handleCourierMessage = async (
  courier,
  text,
  mediaUrl,
  rawSenderId = null,
  rawBase64 = null
) => {
  try {
    const upperText = text ? text.toUpperCase().trim() : "";

    console.log(
      `👮 CourierFlow | ${courier ? courier.name : "Guest"} | Input: ${upperText.substring(
        0,
        20
      )}...`
    );

    // LOGIN
    if (upperText.startsWith("#LOGIN")) {
      const inputPhone = upperText.split(" ")[1];
      if (!inputPhone) return { reply: "⚠️ *Format Salah*\nContoh: `#LOGIN 08123456789`" };

      const cleanPhone = sanitizePhoneNumber(inputPhone);

      if (courier) {
        if (rawSenderId) await courier.update({ device_id: rawSenderId });
        return {
          reply: `✅ *AKUN TERHUBUNG*\nHalo ${courier.name}, perangkat aktif. Ketik *#SIAP* untuk narik.`,
        };
      }

      const targetCourier = await Courier.findOne({ where: { phone: cleanPhone } });
      if (!targetCourier) return { reply: "❌ *Nomor Tidak Dikenal*\nNomor HP belum terdaftar." };

      await targetCourier.update({ device_id: rawSenderId });
      return {
        reply: `🎉 *SELAMAT DATANG ${targetCourier.name}!*\nDevice terhubung. Ketik *#SIAP* untuk mulai.`,
      };
    }

    if (!courier) {
      return { reply: "👋 Silakan Login: ketik\n*#LOGIN <NOMOR_HP_ANDA>*" };
    }

    // ACTIVE ORDER FLOW
    const activeOrder = await Order.findOne({
      where: {
        courier_id: courier.id,
        status: { [Op.in]: ["ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
      },
    });

    if (activeOrder) {
      // FASE BELANJA (ON_PROCESS)
      if (activeOrder.status === "ON_PROCESS") {
        // JIKA INPUT GAMBAR (URL / Base64)
        if (mediaUrl || rawBase64) {
          // Respon cepat agar tidak timeout (Return NULL ke N8N agar koneksi putus)
          // Kirim pesan proses via messageService
          await messageService.sendMessage(
            courier.phone,
            "⏳ *Sedang Scan Struk...*\nSistem sedang menyimpan bukti & scan harga..."
          );

          // PROSES BACKGROUND (ASYNC)
          (async () => {
            try {
              const fileName = `invoice_${activeOrder.order_id}_${Date.now()}.jpg`;

              const storedFileName = await storageService.uploadFileFromUrl(
                mediaUrl || rawBase64, // URL/Source
                fileName // Nama File Tujuan
              );

              if (!storedFileName) throw new Error("Gagal simpan ke MinIO");

              let cleanBase64 = rawBase64
                ? rawBase64.replace(/^data:image\/\w+;base64,/, "")
                : null;
              const aiResult = await aiService.readInvoice(
                cleanBase64 || mediaUrl,
                activeOrder.items_summary
              );

              const detectedTotal =
                typeof aiResult === "object" ? aiResult.total : parseInt(aiResult) || 0;

              // Simpan Draft (File Name tersimpan di DB, tapi tidak dikirim otomatis ke user)
              await orderService.saveBillDraft(activeOrder.order_id, detectedTotal, storedFileName);

              // Auto-Confirm (3 Menit)
              setTimeout(async () => {
                const freshOrder = await Order.findByPk(activeOrder.order_id);
                if (
                  freshOrder &&
                  freshOrder.status === "BILL_VALIDATION" &&
                  freshOrder.total_amount === detectedTotal
                ) {
                  const autoReply = await executeBillFinalization(courier.id, activeOrder.order_id);
                  if (autoReply)
                    await messageService.sendMessage(
                      courier.phone,
                      `⚠️ *AUTO-CONFIRM*\n${autoReply}`
                    );
                }
              }, 3 * 60 * 1000);

              // Kirim Hasil Scan ke Kurir
              const replyText =
                `🧾 *HASIL SCAN TAGIHAN*\n` +
                `Sistem membaca: *${toIDR(detectedTotal)}*\n\n` +
                `✅ Ketik *Y* / *OK* jika benar.\n` +
                `✏️ Ketik *Angka* (cth: 50000) jika salah.`;

              await messageService.sendMessage(courier.phone, replyText);
            } catch (err) {
              console.error("❌ Error Background Process:", err);
              await messageService.sendMessage(
                courier.phone,
                "❌ *Gagal Scan Gambar*\nGambar kurang jelas atau sistem sibuk. Mohon foto ulang struknya."
              );
            }
          })();

          // Return null ke Controller agar Webhook 200 OK cepat
          return null;
        }

        // Jika Kurir kirim Teks biasa
        return {
          reply: "📸 *Status: Belanja*\nKak, silakan kirim **FOTO STRUK/NOTA** belanjaan sekarang.",
        };
      }

      // KONFIRMASI (BILL_VALIDATION)
      else if (activeOrder.status === "BILL_VALIDATION") {
        const cleanNum = upperText.replace(/[^0-9]/g, "");
        const validYes = ["Y", "YA", "YES", "OK", "OKE", "SIAP", "BENAR"];

        // JIKA CONFIRM "Y"
        if (validYes.includes(upperText)) {
          // Panggil fungsi finalisasi yang sudah diubah
          const reply = await executeBillFinalization(courier.id, activeOrder.order_id);
          return { reply: reply || "⚠️ Gagal memproses data. Coba lagi." };
        }
        // JIKA KOREKSI HARGA
        else if (cleanNum.length > 3 && /^\d+$/.test(cleanNum)) {
          const newTotal = parseInt(cleanNum);
          await activeOrder.update({ total_amount: newTotal });
          return {
            reply: `✏️ *Revisi Harga Berhasil*\nTotal Baru: *${toIDR(
              newTotal
            )}*.\n\nKetik *OK* / *Y* jika sudah pas.`,
          };
        }
        return {
          reply: "⚠️ Ketik *Y* jika benar, atau ketik *Angka Rupiah* untuk revisi.",
        };
      }

      // FASE PENGANTARAN (BILL_SENT)
      else if (activeOrder.status === "BILL_SENT") {
        if (upperText === "#SELESAI") {
          await orderService.completeOrder(activeOrder.order_id, courier.id);
          await messageService.sendMessage(
            activeOrder.user_phone,
            "Terima kasih sudah order di MyJek! Ditunggu order selanjutnya yah kak. 🥰"
          );
          return {
            reply:
              "🏁 *ORDER SELESAI!*\nTerima kasih Partner MyJek! Status kembali *IDLE (ONLINE)*, dan kamu siap menerima order lagi. 😃",
          };
        }
        return {
          reply:
            "🛵 *Sedang Mengantar*\nPastikan foto nota sudah dikirim ke user. Ketik *#SELESAI* jika barang sudah diterima customer.",
        };
      }
    }

    // GLOBAL COMMANDS
    if (upperText === "#SIAP") {
      await courier.update({ status: "IDLE", last_active_at: new Date() });
      await redisClient.sAdd("online_couriers", String(courier.id));

      // Cek Backfill Order
      const pendingOrder = await Order.findOne({ where: { status: "LOOKING_FOR_DRIVER" } });
      if (pendingOrder) {
        await dispatchService.offerOrderToCourier(pendingOrder, courier);
        return;
      }

      return { reply: `🟢 *STATUS AKTIF*\nSelamat bekerja!\n\n${getDashboardReply(courier)}` };
    } else if (upperText === "#OFF") {
      await courier.update({ status: "OFFLINE" });
      await redisClient.sRem("online_couriers", String(courier.id));
      return { reply: `⛔ *STATUS OFFLINE*\nHati-hati di jalan. 👋` };
    } else if (upperText.startsWith("#AMBIL")) {
      const orderId = upperText.split(" ")[1];
      const result = await orderService.takeOrder(orderId, courier.id);
      if (!result.success) return { reply: `❌ ${result.message}` };
      return { reply: `🚀 *ORDER DIAMBIL!*\nLokasi: ${result.data.pickup_address}` };
    } else if (["#INFO", "MENU", "PING"].includes(upperText)) {
      return { reply: getDashboardReply(courier) };
    }

    return {
      reply: `🤖 *Bot System*\nPerintah tidak dikenal. Ketik *#INFO*.`,
    };
  } catch (error) {
    console.error("❌ CRITICAL ERROR di CourierFlow:", error);
    return {
      reply: "⚠️ *Sistem Gangguan*\nMohon coba lagi sebentar lagi.",
    };
  }
};
