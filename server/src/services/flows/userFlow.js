import { User, ChatSession, Order, sequelize } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";
import {
  formatSummaryReply,
  getStatusMessage,
  sanitizePhoneNumber,
} from "../../utils/formatter.js";
import { orderService } from "../orderService.js";
import { redisClient } from "../../config/redisClient.js";
import { dispatchService } from "../dispatchService.js";

// Helper sapaan
const sapa = (name) => (name === "Customer" || !name ? "Kak" : `Kak ${name}`);

export const handleUserMessage = async (
  phone,
  name,
  text,
  rawSenderId,
  locationData = null,
  io = null,
) => {
  // SETUP USER & REGISTRASI
  let user = await User.findOne({
    where: sequelize.or({ phone: rawSenderId }, { device_id: rawSenderId }),
  });

  // Logika Registrasi
  const isInvalidUser = !user || user.phone.startsWith("254");

  if (isInvalidUser) {
    const potentialPhone = sanitizePhoneNumber(text);

    if (potentialPhone) {
      const existingUser = await User.findOne({ where: { phone: potentialPhone } });
      if (existingUser) {
        await existingUser.update({ device_id: rawSenderId });
        return {
          reply: `✅ *AKUN TERHUBUNG!*\nHalo ${sapa(
            existingUser.name,
          )}, perangkat kamu berhasil terhubung. Selamat datang di MyJekID - Layanan pesan antar untuk daerah sekitaran Sumbawa. Mau pesan apa kak hari ini? 😃`,
        };
      } else {
        await User.create({
          phone: potentialPhone,
          name: name || "Pelanggan",
          device_id: rawSenderId,
        });
        return {
          reply: `✅ *REGISTRASI BERHASIL!*\nSalam kenal ${sapa(
            name,
          )}. Nomor HP ${potentialPhone} sudah tersimpan di sistem kami kak. Selamat datang di MyJekID - Layanan pesan antar untuk daerah sekitaran Sumbawa.\n\nMau pesan makan apa hari ini? 😃`,
        };
      }
    } else {
      return {
        reply: `👋 Halo Kak! Selamat datang di MyJekID - Layanan pesan antar untuk daerah sekitar Sumbawa.\n\nKarena Kakak baru pertama kali chat, mohon verifikasi nomor HP dulu ya.\n\n👉 *Silakan ketik Nomor WA Kakak* (Contoh: 08123456789).`,
      };
    }
  }

  // SETUP SESSION & REDIS MEMORY
  const realPhone = user.phone;
  const [session] = await ChatSession.findOrCreate({
    where: { phone: realPhone },
    defaults: { mode: "BOT" },
  });

  // Blocking Jika Mode Human Aktif (Bot Diam)
  if (session.mode === "HUMAN") {
    // Return null agar bot tidak membalas apa-apa.
    // Pesan user tetap akan muncul di Dashboard Admin via Socket (di webhookController).
    return null;
  }

  const redisKey = `session:${realPhone}:draft`;
  const rawDraft = await redisClient.get(redisKey);
  let sessionDraft = rawDraft ? JSON.parse(rawDraft) : {};

  // Cek Device ID
  const isDeviceID = phone.startsWith("254") || phone.includes("@lid");
  if (isDeviceID && !user.device_id) {
    return {
      reply: "Halo Kak! 👋 Tolong ketik *#HP <NOMOR_WA>* dulu ya biar ordernya lancar.",
    };
  }

  // HANDLER KHUSUS LOKASI (UPDATE KOORDINAT)
  if (locationData && locationData.latitude) {
    console.log(
      `User ${name} Shared Location: ${locationData.latitude}, ${locationData.longitude}`,
    );

    // Update DB User (Permanen)
    await user.update({
      latitude: locationData.latitude,
      longitude: locationData.longitude,
    });

    // Update Draft Redis
    sessionDraft.has_coordinate = true;
    sessionDraft.coordinate = {
      lat: locationData.latitude,
      long: locationData.longitude,
    };

    await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

    return {
      reply: `✅ *TITIK LOKASI DITERIMA!*\n\nKoordinat peta sudah saya diperbarui yah kak. Kurir akan mengacu pada titik ini untuk mengantarkan order kakak nantinya.\n\nApakah pesanan sudah benar semua? Balas *YA* untuk konfirmasi order yah kak. 😃🙏`,
    };
  }

  // LOGIC PAUSE (Untuk delay bot, beda dengan Human Mode)
  if (session.is_paused_until) {
    const now = new Date();
    if (now >= new Date(session.is_paused_until)) {
      await session.update({ is_paused_until: null });
    } else {
      return { action: "noop" };
    }
  }

  if (text.trim().startsWith("#")) {
    return {
      reply:
        "Mohon maaf kak, perintah tersebut belum saya kenali saat ini. Ketik #INFO untuk melihat informasi kurir.. 🙏",
    };
  }

  try {
    // CONTEXT GATHERING
    const draftOrder = await Order.findOne({
      where: { user_phone: phone, status: "DRAFT" },
      order: [["created_at", "DESC"]],
    });
    const activeOrder = await Order.findOne({
      where: {
        user_phone: phone,
        status: ["LOOKING_FOR_DRIVER", "ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"],
      },
      order: [["created_at", "DESC"]],
    });
    const lastSuccessOrder = await Order.findOne({
      where: { user_phone: phone, status: "COMPLETED" },
      order: [["created_at", "DESC"]],
    });

    let currentStatus = "NONE";
    let combinedDraft = {};

    if (draftOrder) {
      const hasItems = draftOrder.items_summary?.length > 0;
      const hasAddress = draftOrder.delivery_address?.length > 2;
      currentStatus = hasItems && hasAddress ? "WAITING_CONFIRMATION" : "DRAFT_INCOMPLETE";

      combinedDraft = {
        existing_items: draftOrder.items_summary,
        existing_pickup: draftOrder.pickup_address,
        existing_address: draftOrder.delivery_address,
        ...sessionDraft,
      };
    } else if (activeOrder) {
      currentStatus = "ORDER_IN_PROGRESS";
      combinedDraft = sessionDraft;
    }

    const contextData = {
      user_name: name,
      phone_number: phone,
      current_order_status: currentStatus,
      draft_data: combinedDraft,
      history_address:
        user.address_text || (lastSuccessOrder ? lastSuccessOrder.delivery_address : null),
    };

    // AI PROCESSING
    const aiResult = await aiService.parseOrder(text, contextData);
    let finalReply = aiResult.reply || aiResult.ai_reply || "";

    const mergedItems =
      aiResult.data?.items?.length > 0 ? aiResult.data.items : draftOrder?.items_summary || [];
    const mergedPickup = aiResult.data?.pickup_location || draftOrder?.pickup_address || null;
    const mergedAddress = aiResult.data?.delivery_address || draftOrder?.delivery_address || null;

    let updatedDraftData = { ...combinedDraft, ...aiResult.data };

    // POLITE GUARD (Cek Status Pesanan Aktif jika user cuma bilang makasih/oke)
    const lowerText = text.toLowerCase();
    const isPolite = ["makasih", "thanks", "oke", "siap", "baik"].some((w) =>
      lowerText.includes(w),
    );

    if (isPolite && !draftOrder && !["CHECK_STATUS", "CANCEL"].includes(aiResult.intent)) {
      finalReply = activeOrder
        ? `Sama-sama Kak! Pesanan Kakak saat ini *${getStatusMessage(
            activeOrder.status,
          )}*. Ditunggu ya kak.. 😃`
        : "Sama-sama Kak! Kabari saja kalau mau pesan lagi ya. 😃🙏";
    }

    // CONFIRM FINAL
    else if (aiResult.intent === "CONFIRM_FINAL") {
      if (draftOrder) {
        const validItems = draftOrder.items_summary && draftOrder.items_summary.length > 0;
        const validPickup = draftOrder.pickup_address && draftOrder.pickup_address.length > 2;
        const validAddress = draftOrder.delivery_address && draftOrder.delivery_address.length > 3;

        // WAJIB LOKASI (Dari DB User atau Redis Session)
        const hasLocation = user.latitude || sessionDraft.has_coordinate;

        if (!validItems) {
          finalReply = "Mohon maaf Kak, belum ada menu yang dipesan nih. Mau pesan apa kak?";
        } else if (!validPickup) {
          finalReply =
            "Mohon maaf Kak, lokasi pengambilan (Warung/Toko) belum ada. Mohon diinfo lokasi pengambilan ordernya (Contoh: Warung Bu Sri)";
        } else if (!validAddress) {
          finalReply =
            "Mohon maaf Kak, *Alamat Pengantaran* belum diisi nih. Mohon diinfokan terlebih dulu ke saya kak 🙏";
        }
        // BLOCKING JIKA TIDAK ADA LOKASI
        else if (!hasLocation) {
          finalReply = `*TUNGGU DULU KAK!*\n\nDemi kelancaran, Kakak *WAJIB* mengirimkan Share Location (Titik Peta) rumah kakak terlebih dahulu.\n\n👉 Silahkan klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location*.\n\n_Setelah kirim lokasi, baru balas YA lagi yah kak._ 😅🙏`;
        } else {
          // EKSEKUSI ORDER
          await draftOrder.update({ status: "LOOKING_FOR_DRIVER" });

          await user.update({
            address_text: draftOrder.delivery_address,
            last_order_date: new Date(),
          });

          // Hapus Draft di Redis
          await redisClient.del(redisKey);

          // Memanggil Dispatcher untuk mencari kurir secara otomatis
          dispatchService
            .findDriverForOrder(draftOrder.order_id)
            .catch((err) => console.error("❌ Dispatch Error:", err));

          finalReply = `✅ *Pesanan Dikonfirmasi!*\nStatus: *${getStatusMessage(
            "LOOKING_FOR_DRIVER",
          )}*.\n\nSistem sedang mencarikan kurir terdekat. Mohon tunggu sebentar yah kak...`;
        }
      } else if (activeOrder) {
        finalReply = `Pesanan Kakak *${getStatusMessage(
          activeOrder.status,
        )}*. Mohon ditunggu yah kak.`;
      } else {
        finalReply = "Siap Kak! Ada yang bisa saya bantu pesankan lagi? 😃";
      }
    }

    // CHECK STATUS
    else if (aiResult.intent === "CHECK_STATUS") {
      if (activeOrder) {
        finalReply = `Halo Kak ${sapa(user.name)}, pesanan Kakak saat ini *${getStatusMessage(
          activeOrder.status,
        )}*.\n\nMohon ditunggu ya kak..`;
      } else if (draftOrder) {
        finalReply = `Kakak punya pesanan Draft yang belum dikonfirmasi nih. Mau dilanjutin?`;
      } else {
        finalReply = `Saat ini Kakak tidak punya pesanan aktif. Mau pesan sesuatu kak?`;
      }
    }

    // CANCEL
    else if (aiResult.intent === "CANCEL") {
      if (draftOrder) {
        await draftOrder.update({ status: "CANCELLED" });
        await redisClient.del(redisKey);
        finalReply = `Oke Siap, Pesanan/order baru tersebut *${getStatusMessage(
          "CANCELLED",
        )}*. Ditunggu order selanjutnya yah kak 😅🙏`;
      } else {
        finalReply = "Tidak ada pesanan/order yang aktif saat ini nih kak. Mau pesan apa kak?";
      }
    }

    // PROCESS ORDER (DRAFTING)
    else if (["ORDER_INCOMPLETE", "ORDER_COMPLETE"].includes(aiResult.intent)) {
      if (draftOrder) {
        await draftOrder.update({
          items_summary: mergedItems,
          pickup_address: mergedPickup,
          delivery_address: mergedAddress,
          raw_message: text,
        });
      } else {
        if (mergedItems.length === 0) {
          return { reply: "Halo Kak! Mau pesan/order apa hari ini kak?" };
        }
        const addr = mergedAddress || user.address_text || "";
        await orderService.createFromAI(phone, {
          items: mergedItems,
          pickup_location: mergedPickup,
          delivery_address: addr,
          original_message: text,
        });
      }

      // Simpan ke Redis
      await redisClient.set(redisKey, JSON.stringify(updatedDraftData), { EX: 3600 });

      const finalAddress = mergedAddress || draftOrder?.delivery_address || user.address_text || "";
      const hasItems = mergedItems.length > 0;
      const hasPickup = mergedPickup && mergedPickup.length > 2;
      const hasAddress = finalAddress && finalAddress.length > 3;

      if (hasItems && hasPickup && hasAddress) {
        finalReply = formatSummaryReply(name, mergedItems, mergedPickup, finalAddress);
        if (!user.latitude) {
          finalReply += `\n\n*PENTING:* Kakak belum mengirim Share Location.\nMohon kirim *Lokasi Peta (📎)* sekarang agar bisa lanjut pesan (👉 Klik tombol Clip (📎) di WA -> Pilih Location -> Send Your Current Location).`;
        }
      } else {
        if (!hasItems) finalReply = "Siap Kak. Mau pesan menu apa?";
        else if (!hasPickup)
          finalReply = `Oke, pesan *${mergedItems[0].item}*. Mau dibelikan di mana kak? 🙏`;
        else
          finalReply = `Siap, *${mergedItems[0].item}* dari *${mergedPickup}*.\n\nMau diantar ke alamat mana Kak?`;
      }
    } else {
      if (!finalReply) finalReply = "Halo Kak! Ada yang bisa saya bantu pesankan?";
    }

    await session.update({ last_interaction: new Date() });
    return { reply: finalReply };
  } catch (error) {
    console.error("❌ User Flow Error:", error);
    return {
      reply:
        "Maaf, sepertinya telah terjadi kendala teknis nih. Mohon tunggu beberapa saat lagi.\n\nMohon maaf sebelumnya yah kak 🙏",
    };
  }
};
