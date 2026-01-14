import { Op } from "sequelize";
import { redisClient } from "../../config/redisClient.js";
import { orderService } from "../orderService.js";
import { messageService } from "../messageService.js";
import { Order, Courier, User } from "../../models/index.js";
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

const BASE_IMAGE_URL =
  `${process.env.BASE_IMAGE_URL}/${process.env.S3_BUCKET_NAME}` || "http://localhost:3000/uploads";

const getDashboardReply = (courier) => {
  const statusIcon = courier.status === "IDLE" ? "🟢" : courier.status === "BUSY" ? "🔴" : "⚫";
  const locStatus = courier.current_latitude ? "📍 Terkonfirmasi" : "⚠️ Belum ada lokasi";

  return (
    `🏢 *DASHBOARD KURIR MYJEK*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Nama : ${courier.name}\n` +
    `📡 Status : ${statusIcon} *${courier.status}*\n` +
    `🗺️ Posisi : ${locStatus}\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `*Menu Perintah:*\n` +
    `▶️ *#SIAP* : Aktifkan Akun Untuk Menerima Order\n` +
    `⏸️ *#OFF* : Matikan Akun (Istirahat/Offline)\n` +
    `➡️ *#INFO* : Cek Status Kurir Saat ini\n\n` +
    `*PENTING:* Sebagai kurir, kamu wahib aktifkan lokasi terkini dengan cara: 👉 Klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location* untuk mendapatkan order. \n\n` +
    `_Tetap semangat & hati-hati di jalan!_ 💪`
  );
};

const executeBillFinalization = async (courier, orderId) => {
  try {
    console.log(`Finalizing Order: ${orderId} by Courier: ${courier.name}`);

    // Finalisasi via Service (Memindahkan Draft -> Real Data di DB)
    const order = await orderService.finalizeBill(orderId);

    if (!order) {
      console.error("Gagal finalize bill: Order not found.");
      return {
        reply:
          "Gagal memproses data tagihan. Order tidak ditemukan nih kak. Mohon coba lagi beberapa saat kemudian.. 🙏",
      };
    }

    // Fetch User Manual (Anti-Crash Logic)
    let user = await User.findOne({ where: { phone: order.user_phone } });

    // Cari via user_id jika ada
    if (!user && order.user_id) {
      user = await User.findByPk(order.user_id);
    }

    if (!user) {
      console.error(`CRITICAL: User dengan HP ${order.user_phone} tidak ditemukan.`);
      return {
        reply:
          "Order tersimpan, tapi data User hilang kak. Jadi, saya tidak bisa kirim notif nih. 🙏",
      };
    }

    // Hitung Total Final
    const finalTotal = parseFloat(order.total_amount || 0);

    // Update Status Order
    await order.update({
      status: "BILL_SENT",
    });

    // Siapkan URL Gambar untuk N8N
    let imageUrl = order.invoice_image_url;
    // Jika di DB cuma nama file (cth: invoice_123.jpg), gabungkan dengan Base URL
    if (imageUrl && !imageUrl.startsWith("http")) {
      imageUrl = `${BASE_IMAGE_URL}/${imageUrl}`;
    }

    // Pesan Caption untuk User (Disederhanakan)
    const userCaption =
      `✅ *ORDER SELESAI DIBELANJAKAN!*\n` +
      `Halo Kak ${user.name}, pesanan sudah dibeli oleh kurir bernama ${courier.name}.\n\n` +
      `🗒️ *TOTAL TAGIHAN: ${toIDR(finalTotal)}*\n` +
      `_(Sudah termasuk harga barang, ongkos kirim dan jasa titip)_\n\n` +
      `Mohon siapkan uang pas ya Kak. Driver atau kurir kami segera meluncur! 🛵\n` +
      `📸 *LINK FOTO STRUK/NOTA TERLAMPIR DIBAWAH INI 👇*`;

    // Kirim Notifikasi ke Kurir (Direct Message)
    const courierMsg =
      `✅ *TAGIHAN TERKONFIRMASI!*\n` +
      `Nominal: ${toIDR(finalTotal)}\n\n` +
      `Foto struk sedang dikirim otomatis ke Customer...\n` +
      `👉 Silakan antar pesanan ke: ${order.delivery_address}\n\n` +
      `Ketik *#SELESAI* nanti jika barang sudah diterima customer yah kak.`;

    await messageService.sendMessage(courier.phone, courierMsg);

    // Return Action ke Controller (Untuk Trigger N8N Kirim Gambar ke User)
    return {
      action: "trigger_n8n_image",
      data: {
        to: user.phone,
        url: imageUrl,
        caption: userCaption,
      },
    };
  } catch (error) {
    console.error("Error CRITICAL di executeBillFinalization:", error);
    return {
      reply:
        "Terjadi kesalahan sistem saat finalisasi gambar struk/nota. Mohon coba beberapa saat lagi.. 🙏",
    };
  }
};

// HANDLE UPDATE LOKASI
export const handleCourierLocation = async (courier, lat, lng, io) => {
  try {
    // Update Database
    await courier.update({
      current_latitude: lat,
      current_longitude: lng,
      last_active_at: new Date(),
    });

    console.log(`DB Updated: ${courier.name} -> [${lat}, ${lng}]`);

    // Emit ke Socket.io (Untuk Live Map)
    if (io) {
      io.emit("courier-location-update", {
        id: courier.id,
        name: courier.name,
        phone: courier.phone,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        status: courier.status,
        updatedAt: new Date(),
      });
    }
    return true;
  } catch (error) {
    console.error("Error saving courier location:", error);
    return false;
  }
};

// MAIN HANDLER
export const handleCourierMessage = async (
  courier,
  text,
  mediaUrl = null,
  rawSenderId = null,
  rawBase64 = null,
  locationArg = null,
  io = null
) => {
  try {
    let location = locationArg;

    if (mediaUrl && typeof mediaUrl === "object") {
      // { latitude: -6.2, longitude: 106.8 }
      if (mediaUrl.latitude) {
        location = mediaUrl;
        mediaUrl = null;
      }
      // { lat: -6.2, lng: 106.8 } (Format WAHA/N8N umum)
      else if (mediaUrl.lat || (mediaUrl._data && mediaUrl._data.lat)) {
        location = {
          latitude: mediaUrl.lat || mediaUrl._data.lat,
          longitude: mediaUrl.lng || mediaUrl._data.lng,
        };
        mediaUrl = null;
      }
    }

    const upperText = text ? text.toUpperCase().trim() : "";

    console.log(
      `👮 CourierFlow | ${courier ? courier.name : "Guest"} | Input: ${upperText.substring(
        0,
        20
      )}...`
    );

    // DEFENSIVE CODING
    if (upperText === "#TEST KURIR") {
      return { reply: "🛠️ *MODE TESTING AKTIF*\nAnda sekarang dalam simulasi sebagai Kurir." };
    }
    if (upperText === "#TEST USER") {
      return { reply: "🛠️ Silakan ketik perintah user." };
    }

    // LOGIN FLOW
    if (upperText.startsWith("#LOGIN")) {
      const inputPhone = upperText.split(" ")[1];
      if (!inputPhone) return { reply: "*Format Salah*\nContoh: `#LOGIN 08123456789`" };

      const cleanPhone = sanitizePhoneNumber(inputPhone);

      if (courier) {
        if (rawSenderId) await courier.update({ device_id: rawSenderId });
        return {
          reply: `✅ *AKUN TERHUBUNG*\nHalo kak ${courier.name}, perangkat kamu sudah aktif. Ketik *#SIAP* untuk memulai shift.`,
        };
      }

      const targetCourier = await Courier.findOne({ where: { phone: cleanPhone } });
      if (!targetCourier)
        return {
          reply:
            "*Nomor tersebut masih tidak dikenali kak*\nNomor HP belum terdaftar, silahkan hubungi admin.",
        };

      await targetCourier.update({ device_id: rawSenderId });
      return {
        reply: `*SELAMAT DATANG ${targetCourier.name}!*\nDevice sudah terhubung ni kak. Ketik *#SIAP* untuk mulai shift.`,
      };
    }

    // LOCATION UPDATE HANDLER
    if (location && location.latitude && !isNaN(parseFloat(location.latitude))) {
      // Panggil helper update DB & Socket
      await handleCourierLocation(courier, location.latitude, location.longitude, io);

      // Balasan Khusus Kurir
      return {
        reply: `✅ *POSISI TERUPDATE!*\n\nLokasi Kamu sebagai kurir telah tersimpan di sistem admin.\nStatus: *${
          courier?.status || "Aktif"
        }*\n\n*PENTING*: Selalu Update lokasi terakhir kamu kepada saya yah kak terutama saat sedang sedang aktif (IDLE) ataupun saat menjalankan order pelanggan. Terima kasih 👍`,
      };
    }

    if (!courier) {
      return {
        reply:
          "Silakan Login terlebih dahulu kak, ketik:\n*#LOGIN <NOMOR_HP_ANDA>* (contoh: 08123456789)",
      };
    }

    // C. ACTIVE ORDER FLOW (ON_PROCESS / SCAN STRUK)
    const activeOrder = await Order.findOne({
      where: {
        courier_id: courier.id,
        status: { [Op.in]: ["ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
      },
      include: [{ model: Courier, as: "courier" }],
    });

    if (activeOrder) {
      // FASE BELANJA (ON_PROCESS)
      if (activeOrder.status === "ON_PROCESS") {
        if (mediaUrl || rawBase64) {
          await messageService.sendMessage(
            courier.phone,
            "⏳ *Sedang Scan Struk...*\nSistem sedang menyimpan bukti & scan harga, Mohon tunggu sebentar yah kak..."
          );

          (async () => {
            try {
              const fileName = `invoice_${activeOrder.order_id}_${Date.now()}.jpg`;
              const imageInput = mediaUrl || rawBase64;
              let storedFileName;

              // UPLOAD KE MINIO
              if (typeof imageInput === "string" && imageInput.startsWith("http")) {
                storedFileName = await storageService.uploadFileFromUrl(imageInput, fileName);
              } else {
                storedFileName = await storageService.uploadBase64(imageInput, fileName);
              }

              if (!storedFileName) throw new Error("Gagal simpan ke MinIO");
              console.log(`Upload MinIO Sukses: ${storedFileName}`);

              // BYPASS URL ISSUE -> DOWNLOAD BASE64 DARI MINIO
              const rawBase64 = await storageService.downloadFileAsBase64(storedFileName);

              if (!rawBase64) throw new Error("Gagal download Base64 dari MinIO (Data Kosong)");

              // FORMATTING & SEND TO AI
              // Tambahkan prefix agar dikenali sebagai valid Image Data URI
              const formattedBase64 = `data:image/jpeg;base64,${rawBase64}`;

              console.log(`AI Processing: Mengirim Base64 (Length: ${rawBase64.length})`);

              // Coba kirim dengan prefix (formattedBase64)
              // Jika AI Service Anda menolak prefix, ganti variabel di bawah ini menjadi 'rawBase64'
              const aiResult = await aiService.readInvoice(
                formattedBase64,
                activeOrder.items_summary
              );

              const detectedTotal =
                typeof aiResult === "object" ? aiResult.total : parseInt(aiResult) || 0;

              // Simpan Draft
              await orderService.saveBillDraft(activeOrder.order_id, detectedTotal, storedFileName);

              // Auto-Confirm Logic
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

              const replyText =
                `🧾 *HASIL SCAN STRUK/NOTA TAGIHAN*\n` +
                `Total Tagihan: *${toIDR(detectedTotal)}*\n\n` +
                `✅ Ketik *Y* / *OK* jika benar.\n` +
                `✏️ Ketik *Angka* (cth: 50000) jika nonimal total tagihan tidak sesuai.`;

              await messageService.sendMessage(courier.phone, replyText);
            } catch (err) {
              console.error("❌ Error Background Process:", err);
              await messageService.sendMessage(
                courier.phone,
                "*Gagal Scan Gambar*\nMaaf kak, Sistem tidak dapat membaca gambar tersebut. Mohon ketik manual total tagihannya (Cth: 50000)."
              );
            }
          })();

          return null;
        }

        return {
          reply:
            "*Status order saat ini: Belanja*\nKak, silakan kirim **FOTO STRUK/NOTA** belanjaan jika sudah selesai belanja yah. Saya akan membantu untuk menghitung total tagihan belanjanya.. 😅🙏",
        };
      }

      // FASE VALIDASI
      else if (activeOrder.status === "BILL_VALIDATION") {
        const cleanNum = upperText.replace(/[^0-9]/g, "");
        const validYes = ["Y", "YA", "YES", "OK", "OKE", "SIAP", "BENAR"];

        if (validYes.includes(upperText)) {
          const n8nImageAction = await executeBillFinalization(courier, activeOrder.order_id);

          if (n8nImageAction && n8nImageAction.action === "trigger_n8n_image") {
            return n8nImageAction;
          }

          return { reply: "⚠️ Gagal memproses data. Mohon coba lagi." };
        } else if (cleanNum.length > 3 && /^\d+$/.test(cleanNum)) {
          const newTotal = parseInt(cleanNum);
          await activeOrder.update({ total_amount: newTotal });
          return {
            reply: `*Revisi Harga Berhasil*\nTotal Tagihan (setelah di update): *${toIDR(
              newTotal
            )}*.\n\nApakah sudah benar kak? Ketik *OK* / *Y* jika sudah pas/benar.`,
          };
        }
        return {
          reply:
            "Ketik *Y* jika benar, atau ketik *Angka (dalam) Rupiah (Cth: 15000)* untuk revisi.",
        };
      }

      // FASE ANTAR
      else if (activeOrder.status === "BILL_SENT") {
        if (upperText === "#SELESAI") {
          await orderService.completeOrder(activeOrder.order_id, courier.id);
          await messageService.sendMessage(
            activeOrder.user_phone,
            "Terima kasih sudah order di MyJek yah kak! Ditunggu order selanjutnya. 🥰"
          );
          return {
            reply:
              "*ORDER SELESAI!*\nTerima kasih Partner MyJek! Status kembali menjadi *IDLE (ONLINE)*, dan kamu siap menerima order lagi. 😃",
          };
        }
        return {
          reply:
            "*Sedang Mengantar*\nTolong Ketik *#SELESAI* jika barang sudah diterima customer yah kak.",
        };
      }
    }

    // GLOBAL COMMANDS (#SIAP, #OFF, #AMBIL, #INFO)
    if (upperText === "#SIAP") {
      // Kurir tidak bisa #SIAP jika database belum punya lokasi
      if (!courier.current_latitude || !courier.current_longitude) {
        return {
          reply: `⛔ *AKSES DITOLAK*\n\nMaaf kak, kamu belum mengirim lokasi saat ini. Sistem tidak bisa memberi order jika tidak tahu posisi Anda.\n\n👉 Klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location*.\n\n_Setelah kirim lokasi, baru ketik #SIAP lagi yah kak._ 😅🙏`,
        };
      }

      await courier.update({ status: "IDLE", last_active_at: new Date() });
      await redisClient.sAdd("online_couriers", String(courier.id));

      const pendingOrder = await Order.findOne({ where: { status: "LOOKING_FOR_DRIVER" } });
      if (pendingOrder) {
        await dispatchService.offerOrderToCourier(pendingOrder, courier);
        return;
      }

      return {
        reply: `🟢 *STATUS AKTIF*\nSelamat bekerja!\n\n${getDashboardReply(courier)}`,
      };
    } else if (upperText === "#OFF") {
      await courier.update({ status: "OFFLINE" });
      await redisClient.sRem("online_couriers", String(courier.id));
      return { reply: `⛔ *STATUS OFFLINE*\nHati-hati di jalan yah kak. 👋` };
    } else if (upperText.startsWith("#AMBIL")) {
      // Double check: Jangan sampai ambil order kalau lokasi hilang
      if (!courier.current_latitude || !courier.current_longitude) {
        return {
          reply: `⛔ *TIDAK BISA AMBIL ORDER*\n\nMaaf kak, data lokasi kamu saat ini masih kosong/belum terupdate. Kakak wajib kirim *Share Location (📎)* sekarang agar bisa mengambil order..`,
        };
      }

      const orderId = upperText.split(" ")[1];
      const result = await orderService.takeOrder(orderId, courier.id);
      if (!result.success) return { reply: `❌ ${result.message}` };

      const orderData = result.data;
      const userData = orderData.user;

      const custName = userData ? userData.name : "Pelanggan";
      const custPhone = userData ? userData.phone : orderData.user_phone;

      const detailMsg =
        `🚀 *ORDER BERHASIL DIAMBIL!*\n\n` +
        `👤 *Nama Pelanggan:* ${custName}\n` +
        `📱 *No. WA:* ${custPhone}\n\n` +
        `📍 *Antar ke:* ${orderData.delivery_address}\n` +
        `📍 *Ambil di (pickup):* ${orderData.pickup_address}\n` +
        `📦 *Item:* \n${orderData.items_summary
          .map((i) => `- ${i.item || "Menu"} (x${i.qty || 1})${i.note ? ` - ${i.note}` : ""}`)
          .join(", ")}\n\n` +
        `_Silakan menuju lokasi pengantaran pada lokasi yang sudah diberikan 👇._\n` +
        `*PENTING*: Selalu Update lokasi terkini kamu kepada saya yah kak, terutama saat sedang aktif (IDLE) ataupun saat menjalankan order pelanggan (👉 Klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location*). Terima kasih 👍`;

      await messageService.sendMessage(courier.phone, detailMsg);

      // Return Object Location untuk n8n
      if (userData && userData.latitude && userData.longitude) {
        return {
          type: "location",
          latitude: parseFloat(userData.latitude),
          longitude: parseFloat(userData.longitude),
          address: orderData.delivery_address,
          reply: "",
        };
      } else {
        // Fallback jika user tidak punya koordinat
        return {
          reply:
            detailMsg +
            "\n\n*PENTING:* Maaf kak, koordinat User/Customer tidak tersedia nih. Mohon chat user untuk minta Share Location yah kak. 🙏",
        };
      }
    } else if (["#INFO", "MENU", "PING"].includes(upperText)) {
      return { reply: getDashboardReply(courier) };
    }

    return {
      reply: `*INFO*\nMaaf kak, perintah tidak saya kenal. Tolong ketik *#INFO* untuk melihat informasi detail kurir.`,
    };
  } catch (error) {
    console.error("CRITICAL ERROR:", error);
    return {
      reply:
        "⚠️ Maaf kak, saat ini sepertinya *Sistem sedang mengalami gangguan*\nMohon coba sebentar lagi yah kak. 🙏",
    };
  }
};
