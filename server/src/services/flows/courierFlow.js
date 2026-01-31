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

const normalizeNote = (note) =>
  (note || "")
    .toString()
    .toLowerCase()
    .replace(/bilang aja\s+/g, "")
    .replace(/bilang\s+/g, "")
    .replace(/\bdri\b/g, "dari")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const uniqueNotesList = (notes = []) => {
  const seen = new Set();
  return notes
    .map((n) => (typeof n === "string" ? n : n?.note))
    .filter(Boolean)
    .filter((note) => {
      const key = normalizeNote(note);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const buildCourierContext = ({
  courier,
  order,
  user,
  items = [],
  pickup = "",
  address = "",
  notes = [],
  flags = {},
  lastMessage = "",
}) => ({
  role: "COURIER",
  courier_name: courier?.name || "Kurir",
  courier_status: courier?.status || "UNKNOWN",
  order_status: order?.status || "NONE",
  items,
  pickup,
  address,
  notes: uniqueNotesList(notes),
  user_name: user?.name || "Customer",
  user_phone: user?.phone || order?.user_phone || "",
  flags,
  last_message: lastMessage,
});

const buildCourierReply = async (responseSpec) => {
  return await aiService.generateReply(responseSpec);
};

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
    `*PENTING:* Sebagai kurir, kamu wajib aktifkan lokasi terkini dengan cara: 👉 Klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location* untuk mendapatkan order. \n\n` +
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

    const userCaption = await aiService.generateReply({
      role: "CUSTOMER",
      status: "BILL_SENT_TO_CUSTOMER",
      context: {
        role: "CUSTOMER",
        user_name: user.name,
        courier_name: courier.name,
        order_status: order.status,
        items: order.items_summary || [],
        pickup: order.pickup_address,
        address: order.delivery_address,
        notes: uniqueNotesList(order.order_notes || []),
        total_amount: finalTotal,
        flags: { show_details: true },
        last_message: "",
      },
      required_phrases: [`Total tagihan: Rp${finalTotal.toLocaleString("id-ID")}`],
    });

    const courierMsg = await aiService.generateReply({
      role: "COURIER",
      status: "BILL_CONFIRMED",
      context: buildCourierContext({
        courier,
        order,
        user,
        items: order.items_summary || [],
        pickup: order.pickup_address || "",
        address: order.delivery_address || "",
        notes: uniqueNotesList(order.order_notes || []),
        flags: { total_amount: finalTotal, action: "DELIVER_ORDER", show_details: false },
      }),
    });

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

    // Jika kurir OFFLINE, anggap lokasi ini sebagai "online kembali"
    if (courier.status === "OFFLINE") {
      await courier.update({ status: "IDLE", is_active: true });
      await redisClient.sAdd("online_couriers", String(courier.id));
      await dispatchService.offerPendingOrdersToCourier(courier);
    }

    console.log(`DB Updated: ${courier.name} -> [${lat}, ${lng}]`);

    // Emit ke Socket.io (Live Map)
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
  io = null,
) => {
  try {
    const LOCATION_INSTRUCTION =
      "*Penting:* Selalu update lokasi terkini kamu yah agar pelanggan bisa tau posisi ordernya secara real-time. \n\nSilahkan klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location*.\n\nTerima kasih, semangat kak!😃👍";
    const makeCourierReply = async (status, context, required_phrases = []) =>
      await buildCourierReply({
        role: "COURIER",
        status,
        context,
        required_phrases,
      });
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
        20,
      )}...`,
    );

    // DEFENSIVE CODING
    if (upperText === "#TEST KURIR") {
      return {
        reply: await makeCourierReply(
          "TEST_MODE_COURIER",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    }
    if (upperText === "#TEST USER") {
      return {
        reply: await makeCourierReply(
          "TEST_MODE_USER",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    }

    // LOGIN FLOW
    if (upperText.startsWith("#LOGIN")) {
      const inputPhone = upperText.split(" ")[1];
      if (!inputPhone)
        return {
          reply: await makeCourierReply(
            "LOGIN_FORMAT_INVALID",
            buildCourierContext({ courier, lastMessage: text }),
          ),
        };

      const cleanPhone = sanitizePhoneNumber(inputPhone);

      if (courier) {
        if (rawSenderId) await courier.update({ device_id: rawSenderId });
        return {
          reply: await makeCourierReply(
            "COURIER_ACCOUNT_LINKED",
            buildCourierContext({ courier, lastMessage: text }),
          ),
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
        reply: await makeCourierReply(
          "COURIER_WELCOME",
          buildCourierContext({ courier: targetCourier, lastMessage: text }),
        ),
      };
    }

    // LOCATION UPDATE HANDLER
    if (location && location.latitude && !isNaN(parseFloat(location.latitude))) {
      // Panggil helper update DB & Socket
      await handleCourierLocation(courier, location.latitude, location.longitude, io);

      // Balasan Khusus Kurir
      return {
        reply: await makeCourierReply(
          "COURIER_LOCATION_UPDATED",
          buildCourierContext({ courier, lastMessage: text }),
          [LOCATION_INSTRUCTION],
        ),
      };
    }

    if (!courier) {
      return {
        reply: await makeCourierReply(
          "COURIER_LOGIN_REQUIRED",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    }

    const activeOrder = await Order.findOne({
      where: {
        courier_id: courier.id,
        status: { [Op.in]: ["ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
      },
      include: [{ model: Courier, as: "courier" }],
    });

    // Courier status query or toggle via natural language
    const lowerText = text ? text.toLowerCase() : "";
    const wantsOffline = ["offline", "off", "istirahat", "cuti"].some((w) => lowerText.includes(w));
    const wantsOnline = ["online", "aktif", "siap", "kembali"].some((w) => lowerText.includes(w));
    const asksStatus = ["status", "cek status", "info status", "lagi apa", "sibuk"].some((w) =>
      lowerText.includes(w),
    );

    if (wantsOffline) {
      if (activeOrder) {
        return {
          reply: await makeCourierReply(
            "COURIER_STATUS_CHANGE_BLOCKED",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
        };
      }
      await courier.update({ status: "OFFLINE", device_id: null, is_active: false });
      await redisClient.sRem("online_couriers", String(courier.id));
      return {
        reply: await makeCourierReply(
          "COURIER_OFFLINE",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    }

    if (wantsOnline) {
      if (activeOrder) {
        return {
          reply: await makeCourierReply(
            "COURIER_STATUS_CHANGE_BLOCKED",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
        };
      }
      if (!courier.current_latitude || !courier.current_longitude) {
        return {
          reply: await makeCourierReply(
            "COURIER_LOCATION_REQUIRED",
            buildCourierContext({ courier, lastMessage: text }),
            [LOCATION_INSTRUCTION],
          ),
        };
      }
      await courier.update({
        status: "IDLE",
        last_active_at: new Date(),
        device_id: courier.device_id || rawSenderId,
        is_active: true,
      });
      await redisClient.sAdd("online_couriers", String(courier.id));
      await dispatchService.offerPendingOrdersToCourier(courier);
      return {
        reply: await makeCourierReply(
          "COURIER_READY",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    }

    // C. ACTIVE ORDER FLOW (ON_PROCESS / SCAN STRUK)
    const handleScan = async (order) => {
      (async () => {
        try {
          const fileName = `invoice_${order.order_id}_${Date.now()}.jpg`;
          const imageInput = mediaUrl || rawBase64;
          let storedFileName = null;
          let imageForAI = imageInput;

          try {
            if (typeof imageInput === "string" && imageInput.startsWith("http")) {
              storedFileName = await storageService.uploadFileFromUrl(imageInput, fileName);
            } else {
              storedFileName = await storageService.uploadBase64(imageInput, fileName);
            }
          } catch (uploadErr) {
            console.error("❌ Upload MinIO Error:", uploadErr);
          }

          if (storedFileName) {
            const downloadedBase64 = await storageService.downloadFileAsBase64(storedFileName);
            if (downloadedBase64) {
              imageForAI = `data:image/jpeg;base64,${downloadedBase64}`;
            }
          }

          const aiResult = await aiService.readInvoice(
            imageForAI,
            order.items_summary,
          );

          const detectedTotal =
            typeof aiResult === "object" ? aiResult.total : parseInt(aiResult) || 0;

          await orderService.saveBillDraft(order.order_id, detectedTotal, storedFileName);

          setTimeout(
            async () => {
              const freshOrder = await Order.findByPk(order.order_id);
              if (
                freshOrder &&
                freshOrder.status === "BILL_VALIDATION" &&
                freshOrder.total_amount === detectedTotal
              ) {
                const autoReply = await executeBillFinalization(courier.id, order.order_id);
                if (autoReply) {
                  await messageService.sendMessage(
                    courier.phone,
                    `⚠️ *AUTO-CONFIRM*\n${autoReply}`,
                  );
                }
              }
            },
            3 * 60 * 1000,
          );

          const scanResultReply = await makeCourierReply(
            "SCAN_RESULT",
            buildCourierContext({
              courier,
              order,
              items: order.items_summary || [],
              pickup: order.pickup_address || "",
              address: order.delivery_address || "",
              notes: uniqueNotesList(order.order_notes || []),
              flags: { detected_total: detectedTotal },
              lastMessage: text,
            }),
          );
          await messageService.sendMessage(courier.phone, scanResultReply);
        } catch (err) {
          console.error("❌ Error Background Process:", err);
          const scanFailedReply = await makeCourierReply(
            "SCAN_FAILED",
            buildCourierContext({
              courier,
              order,
              items: order.items_summary || [],
              pickup: order.pickup_address || "",
              address: order.delivery_address || "",
              notes: uniqueNotesList(order.order_notes || []),
              lastMessage: text,
            }),
          );
          await messageService.sendMessage(courier.phone, scanFailedReply);
        }
      })();

      return null;
    };

    if (asksStatus) {
      return {
        reply: await makeCourierReply(
          "COURIER_ORDER_STATUS",
          buildCourierContext({
            courier,
            order: activeOrder || null,
            items: activeOrder?.items_summary || [],
            pickup: activeOrder?.pickup_address || "",
            address: activeOrder?.delivery_address || "",
            notes: uniqueNotesList(activeOrder?.order_notes || []),
            flags: { show_details: false },
            lastMessage: text,
          }),
        ),
      };
    }

    if (activeOrder && (mediaUrl || rawBase64)) {
      if (activeOrder.status !== "ON_PROCESS") {
        return {
          reply: await makeCourierReply(
            "SCAN_NOT_ALLOWED",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
        };
      }
      return await handleScan(activeOrder);
    }

    if (activeOrder) {
      // FASE BELANJA (ON_PROCESS)
      if (activeOrder.status === "ON_PROCESS") {
        return {
          reply: await makeCourierReply(
            "REQUEST_INVOICE_PHOTO",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
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

          return {
            reply: await makeCourierReply(
              "BILL_CONFIRM_FAILED",
              buildCourierContext({
                courier,
                order: activeOrder,
                items: activeOrder.items_summary || [],
                pickup: activeOrder.pickup_address || "",
                address: activeOrder.delivery_address || "",
                notes: uniqueNotesList(activeOrder.order_notes || []),
                lastMessage: text,
              }),
            ),
          };
        } else if (cleanNum.length > 3 && /^\d+$/.test(cleanNum)) {
          const newTotal = parseInt(cleanNum);
          await activeOrder.update({ total_amount: newTotal });
          return {
            reply: await makeCourierReply(
              "BILL_UPDATED",
              buildCourierContext({
                courier,
                order: activeOrder,
                items: activeOrder.items_summary || [],
                pickup: activeOrder.pickup_address || "",
                address: activeOrder.delivery_address || "",
                notes: uniqueNotesList(activeOrder.order_notes || []),
                flags: { total_amount: newTotal },
                lastMessage: text,
              }),
            ),
          };
        }
        return {
          reply: await makeCourierReply(
            "BILL_CONFIRM_PROMPT",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
        };
      }

      // FASE ANTAR
      else if (activeOrder.status === "BILL_SENT") {
        if (upperText === "#SELESAI") {
          await orderService.completeOrder(activeOrder.order_id, courier.id);
          const userCompleteReply = await aiService.generateReply({
            role: "CUSTOMER",
            status: "ORDER_COMPLETED",
            context: {
              role: "CUSTOMER",
              user_name: "",
              order_status: "COMPLETED",
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
            },
          });
          await messageService.sendMessage(activeOrder.user_phone, userCompleteReply);
          return {
            reply: await makeCourierReply(
              "ORDER_COMPLETED_COURIER",
              buildCourierContext({
                courier,
                order: activeOrder,
                items: activeOrder.items_summary || [],
                pickup: activeOrder.pickup_address || "",
                address: activeOrder.delivery_address || "",
                notes: uniqueNotesList(activeOrder.order_notes || []),
                lastMessage: text,
              }),
            ),
          };
        }
        return {
          reply: await makeCourierReply(
            "DELIVERY_IN_PROGRESS",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
        };
      }
    }

    // GLOBAL COMMANDS (#SIAP, #OFF, #AMBIL, #INFO)
    if (upperText === "#SIAP") {
      // Kurir tidak bisa #SIAP jika database belum punya lokasi
      if (!courier.current_latitude || !courier.current_longitude) {
        return {
          reply: await makeCourierReply(
            "COURIER_LOCATION_REQUIRED",
            buildCourierContext({ courier, lastMessage: text }),
            [LOCATION_INSTRUCTION],
          ),
        };
      }

      await courier.update({ status: "IDLE", last_active_at: new Date() });
      await redisClient.sAdd("online_couriers", String(courier.id));

      const offered = await dispatchService.offerPendingOrdersToCourier(courier);
      if (offered) {
        return;
      }

      return {
        reply: await makeCourierReply(
          "COURIER_READY",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    } else if (upperText === "#OFF") {
      await courier.update({ status: "OFFLINE" });
      await redisClient.sRem("online_couriers", String(courier.id));
      return {
        reply: await makeCourierReply(
          "COURIER_OFFLINE",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    } else if (upperText.startsWith("#AMBIL")) {
      if (activeOrder) {
        return {
          reply: await makeCourierReply(
            "COURIER_ALREADY_HAS_ORDER",
            buildCourierContext({
              courier,
              order: activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: text,
            }),
          ),
        };
      }
      if (courier.status !== "IDLE" || courier.is_active === false) {
        return {
          reply: await makeCourierReply(
            "ORDER_TAKE_FAILED",
            buildCourierContext({
              courier,
              lastMessage: text,
              flags: { error: "Status kamu belum online. Ketik #SIAP dulu ya." },
            }),
          ),
        };
      }
      // Double check: Jangan sampai ambil order kalau lokasi hilang
      if (!courier.current_latitude || !courier.current_longitude) {
        return {
          reply: await makeCourierReply(
            "COURIER_LOCATION_REQUIRED",
            buildCourierContext({ courier, lastMessage: text }),
            [LOCATION_INSTRUCTION],
          ),
        };
      }

      const inputCode = upperText.split(" ")[1];
      if (!inputCode) {
        return {
          reply: await makeCourierReply(
            "ORDER_TAKE_FAILED",
            buildCourierContext({
              courier,
              lastMessage: text,
              flags: { error: "Format #AMBIL tidak lengkap." },
            }),
          ),
        };
      }

      let orderId = inputCode;
      if (!inputCode.startsWith("ORD-")) {
        const orderByCode = await Order.findOne({
          where: { short_code: inputCode, status: "LOOKING_FOR_DRIVER" },
        });
        if (!orderByCode) {
          return {
            reply: await makeCourierReply(
              "ORDER_TAKE_FAILED",
              buildCourierContext({
                courier,
                lastMessage: text,
                flags: { error: "Order tidak ditemukan atau sudah diambil." },
              }),
            ),
          };
        }
        orderId = orderByCode.order_id;
      }

      const result = await orderService.takeOrder(orderId, courier.id);
      if (!result.success)
        return {
          reply: await makeCourierReply(
            "ORDER_TAKE_FAILED",
            buildCourierContext({ courier, lastMessage: text, flags: { error: result.message } }),
          ),
        };

      const orderData = result.data;
      const userData = orderData.user;

      const custName = userData ? userData.name : "Pelanggan";
      const custPhone = userData ? userData.phone : orderData.user_phone;

      const detailMsg = await makeCourierReply(
        "ORDER_TAKEN",
        buildCourierContext({
          courier,
          order: orderData,
          user: userData,
          items: orderData.items_summary || [],
          pickup: orderData.pickup_address || "",
          address: orderData.delivery_address || "",
          notes: uniqueNotesList(orderData.order_notes || []),
          flags: {
            customer_name: userData?.name || "Pelanggan",
            customer_phone: userData?.phone || orderData.user_phone || "",
            show_details: true,
          },
          lastMessage: text,
        }),
        [LOCATION_INSTRUCTION],
      );

      await messageService.sendMessage(courier.phone, detailMsg);

      const userAssignedReply = await aiService.generateReply({
        role: "CUSTOMER",
        status: "COURIER_ASSIGNED",
        context: {
          role: "CUSTOMER",
          user_name: userData?.name || "Customer",
          order_status: orderData.status,
          items: orderData.items_summary || [],
          pickup: orderData.pickup_address || "",
          address: orderData.delivery_address || "",
          notes: uniqueNotesList(orderData.order_notes || []),
          courier_name: courier.name,
          courier_phone: courier.phone,
        },
      });
      await messageService.sendMessage(orderData.user_phone, userAssignedReply);

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
          reply: await makeCourierReply(
            "ORDER_TAKEN_NO_LOCATION",
            buildCourierContext({
              courier,
              order: orderData,
              user: userData,
              items: orderData.items_summary || [],
              pickup: orderData.pickup_address || "",
              address: orderData.delivery_address || "",
              notes: uniqueNotesList(orderData.order_notes || []),
              lastMessage: text,
            }),
            [LOCATION_INSTRUCTION],
          ),
        };
      }
    } else if (["#INFO", "MENU", "PING"].includes(upperText)) {
      return {
        reply: await makeCourierReply(
          "COURIER_DASHBOARD",
          buildCourierContext({ courier, lastMessage: text }),
        ),
      };
    }

    return {
      reply: await makeCourierReply(
        "UNKNOWN_COMMAND",
        buildCourierContext({ courier, lastMessage: text, known_commands: ["#INFO"] }),
      ),
    };
  } catch (error) {
    console.error("CRITICAL ERROR:", error);
    return {
      reply:
        "⚠️ Maaf kak, saat ini sepertinya *Sistem sedang mengalami gangguan*\nMohon coba sebentar lagi yah kak. 🙏",
    };
  }
};