import { User, ChatSession, Order, sequelize } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";
import {
  formatSummaryReply,
  getStatusMessage,
  sanitizePhoneNumber,
} from "../../utils/formatter.js";
import { orderService } from "../orderService.js";
import { dispatchService } from "../dispatchService.js";

export const handleUserMessage = async (phone, name, text, rawSenderId) => {
  // Setup Session
  let user = await User.findOne({
    where: sequelize.or({ phone: rawSenderId }, { device_id: rawSenderId }),
  });

  // GERBANG REGISTRASI (ONBOARDING)
  // Jika User BELUM ADA di Database, atau Datanya masih salah (Phone = 254...)
  const isInvalidUser = !user || user.phone.startsWith("254");

  if (isInvalidUser) {
    // Cek apakah User sedang mengirim Nomor HP
    const potentialPhone = sanitizePhoneNumber(text);

    if (potentialPhone) {
      // USER MENGINPUT NOMOR HP
      // Cek apakah nomor ini sudah dipakai orang lain?
      const existingUser = await User.findOne({ where: { phone: potentialPhone } });

      if (existingUser) {
        // Jika nomor sudah ada, kita update device_id-nya saja
        await existingUser.update({ device_id: rawSenderId });
        return {
          reply: `✅ *AKUN TERHUBUNG!*\n\nHalo Kak ${existingUser.name}, perangkat ini berhasil disambungkan ke nomor ${potentialPhone}.\nSilakan ketik pesanan kakak sekarang!`,
        };
      } else {
        // Jika benar-benar baru, Buat User Baru
        await User.create({
          phone: potentialPhone, // SIMPAN 62...
          name: name,
          device_id: rawSenderId, // SIMPAN 254... (Device)
        });
        return {
          reply: `✅ *REGISTRASI BERHASIL!*\n\nSalam kenal Kak ${name}. Nomor HP ${potentialPhone} sudah tersimpan.\n\nMau pesan makan apa hari ini?`,
        };
      }
    } else {
      // USER BELUM INPUT NOMOR / INPUT SALAH
      return {
        reply: `👋 Halo Kak! Selamat datang di MyJek.\n\nKarena Kakak baru pertama kali chat (atau pakai WA Web), mohon verifikasi nomor HP dulu ya.\n\n👉 *Silakan ketik Nomor WA Kakak* (Contoh: 08123456789) agar sistem bisa memproses pesanan.`,
      };
    }
  }

  // Jika User Valid, ambil nomor HP aslinya
  const realPhone = user.phone;
  const [session] = await ChatSession.findOrCreate({
    where: { phone: realPhone },
    defaults: { mode: "BOT" },
  });

  // AMBIL NOMOR HP USER (KHUSUS WA WEB)
  // Jika phone yang tersimpan adalah ID Perangkat (dimulai 254/belum format 62),
  // Kita minta user update nomornya agar tersimpan rapi.
  const isDeviceID = phone.startsWith("254") || phone.includes("@lid");

  // Jika User mengirim perintah update nomor: #HP 08123...
  if (text.toUpperCase().startsWith("#HP")) {
    const inputPhone = text.split(" ")[1];
    if (inputPhone && inputPhone.length > 9) {
      // Update data user: Pindahkan ID 254 ke device_id, simpan nomor baru ke phone
      await user.update({
        phone: inputPhone, // Simpan nomor asli
        device_id: rawSenderId, // Simpan ID 254 ke device_id
      });

      return { reply: `✅ Terima kasih Kak! Nomor ${inputPhone} berhasil disimpan.` };
    }
  }

  // Jika ini User Baru pakai WA Web (ID 254) dan belum pernah setor nomor
  if (isDeviceID && !user.device_id) {
    console.log("⚠️ User menggunakan WA Web tapi belum verifikasi nomor HP.");

    return {
      reply:
        "Halo Kak! 👋 Kami butuh informasi no HP dulu nih kak, tolong ketik *#HP <NOMOR_WA>* dulu ya biar ordernya lancar. Contoh: #HP 08123456789",
    };
  }

  // LOGIC PAUSE / HUMAN HANDOFF
  if (session.mode === "HUMAN" || session.paused_until) {
    const now = new Date();

    // Cek Auto-Resume Timer
    // Jika admin set pause sampai jam X, dan sekarang sudah lewat, nyalakan bot.
    if (session.paused_until && now >= new Date(session.paused_until)) {
      await session.update({ mode: "BOT", paused_until: null });
      console.log(`🔔 Auto-Resume: Bot Woke Up for ${phone}`);
    }
    // Jika masih dalam masa hukuman/manual mode
    else {
      console.log(`👤 Human Mode Active for ${phone}. Bot ignored message.`);
      // User tidak bisa memaksa bot hidup.
      return res.status(200).json({ status: "ignored_human_mode" });
    }
  }

  console.log(`🤖 Processing: ${name} (${phone}) - Msg: "${text}"`);

  try {
    // Context Gathering
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
    let draftData = {};

    if (draftOrder) {
      const hasItems = draftOrder.items_summary?.length > 0;
      const hasAddress = draftOrder.delivery_address?.length > 2;
      currentStatus = hasItems && hasAddress ? "WAITING_CONFIRMATION" : "DRAFT_INCOMPLETE";
      draftData = {
        existing_items: draftOrder.items_summary,
        existing_pickup: draftOrder.pickup_address,
        existing_address: draftOrder.delivery_address,
      };
    } else if (activeOrder) {
      currentStatus = "ORDER_IN_PROGRESS";
    }

    const contextData = {
      user_name: name,
      phone_number: phone,
      current_order_status: currentStatus,
      draft_data: draftData,
      history_address:
        user.address_text || (lastSuccessOrder ? lastSuccessOrder.delivery_address : null),
    };

    // AI Processing
    const aiResult = await aiService.parseOrder(text, contextData);
    let finalReply = aiResult.reply || aiResult.ai_reply || "";

    // Data Merging & Logic
    const mergedItems =
      aiResult.data?.items?.length > 0 ? aiResult.data.items : draftOrder?.items_summary || [];
    const mergedPickup = aiResult.data?.pickup_location || draftOrder?.pickup_address || null;
    const mergedAddress = aiResult.data?.delivery_address || draftOrder?.delivery_address || null;

    // Detect Keywords
    const lowerText = text.toLowerCase();
    const isRevision = ["revisi", "ganti", "ubah", "bukan", "salah"].some((w) =>
      lowerText.includes(w)
    );
    const isPolite = ["makasih", "thanks", "oke", "siap", "baik"].some((w) =>
      lowerText.includes(w)
    );

    // Safety Guard
    if (
      activeOrder &&
      !draftOrder &&
      isRevision &&
      ["ORDER_INCOMPLETE", "ORDER_COMPLETE"].includes(aiResult.intent)
    ) {
      finalReply =
        "⚠️ Mohon maaf Kak, pesanan sebelumnya sudah diproses sistem (sedang cari driver/berjalan).\n\nData tidak bisa diubah langsung. Silakan balas *Batal* terlebih dahulu jika ingin mengganti pesanan.";
    }
    // Polite Guard
    else if (isPolite && !draftOrder && !["CHECK_STATUS", "CANCEL"].includes(aiResult.intent)) {
      finalReply = activeOrder
        ? `Sama-sama Kak! Pesanan Kakak ${getStatusMessage(activeOrder.status)}. Ditunggu ya 😃`
        : "Sama-sama Kak! Kabari saja kalau mau pesan lagi ya.";
    }
    // Check Status
    else if (aiResult.intent === "CHECK_STATUS") {
      if (activeOrder)
        finalReply = `Halo Kak ${name}, pesanan Kakak saat ini *${getStatusMessage(
          activeOrder.status
        )}*.\n\nMohon ditunggu ya!`;
      else if (draftOrder)
        finalReply = `Kakak punya pesanan Draft yang belum dikonfirmasi nih. Mau dilanjutin?`;
      else finalReply = `Saat ini Kakak tidak punya pesanan aktif. Mau pesan sesuatu kak?`;
    }
    // CANCEL
    else if (aiResult.intent === "CANCEL") {
      // Cancel Draft
      if (draftOrder) {
        await draftOrder.update({ status: "CANCELLED" });
        finalReply = "👌 Oke, Pesanan baru (Draft) dibatalkan.";
      } else {
        // Cek Order 'LOOKING_FOR_DRIVER' (Bisa dibatalkan)
        const pendingOrders = await Order.findAll({
          where: { user_phone: phone, status: "LOOKING_FOR_DRIVER" },
          order: [["created_at", "DESC"]],
        });

        if (pendingOrders.length === 0) {
          if (activeOrder && activeOrder.status !== "LOOKING_FOR_DRIVER") {
            finalReply =
              "⛔ Maaf, kurir sudah berjalan kak. Pesanan tidak bisa dibatalkan via chat.";
          } else {
            finalReply =
              "Maaf kak, saat ini tidak ada pesanan aktif yang perlu dibatalkan. Silahkan lakukan order terlebih dahulu yah kak.";
          }
        } else if (pendingOrders.length === 1) {
          // Cuma 1 -> Langsung Batal
          const target = pendingOrders[0];
          await target.update({ status: "CANCELLED" });
          const item = target.items_summary?.[0]?.item || "Pesanan";
          finalReply = `⚠️ Pesanan *${item}* berhasil dibatalkan.`;
        } else {
          // Lebih dari 1 -> Cek Spesifik Target
          const cleanText = lowerText.replace("batal", "").trim().toUpperCase();
          let targetOrder = null;

          if (cleanText.length > 0) {
            targetOrder = pendingOrders.find((o) => {
              const realId = o.order_id || o.id;
              const idMatch = String(realId).includes(cleanText);
              const itemMatch = o.items_summary.some((i) =>
                i.item.toLowerCase().includes(cleanText)
              );
              return idMatch || itemMatch;
            });
          }

          if (targetOrder) {
            await targetOrder.update({ status: "CANCELLED" });
            const item = targetOrder.items_summary?.[0]?.item || "Pesanan";
            finalReply = `⚠️ Pesanan *${item}* berhasil dibatalkan.`;
          } else {
            // Tampilkan List
            const listStr = pendingOrders
              .map((o) => {
                const item = o.items_summary?.[0]?.item || "Item";
                const displayId = o.order_id || o.id;
                return `- ${item} (Ketik: Batal ${displayId})`;
              })
              .join("\n");

            finalReply = `Kakak punya ${pendingOrders.length} pesanan aktif. Mau batal yang mana?\n\n${listStr}\n\n👉 Mohon ketik spesifik sesuai contoh di atas. (_Note: abaikan pesan ini jika tidak ingin batal order!_)`;
          }
        }
      }
    }
    // Confirm
    else if (aiResult.intent === "CONFIRM_FINAL") {
      if (draftOrder) {
        const validItems = draftOrder.items_summary && draftOrder.items_summary.length > 0;
        const validPickup = draftOrder.pickup_address && draftOrder.pickup_address.length > 2; // Minimal 3 huruf
        const validAddress = draftOrder.delivery_address && draftOrder.delivery_address.length > 3; // Minimal 4 huruf

        if (!validItems) {
          finalReply = "⚠️ Mohon maaf Kak, belum ada menu yang dipesan. Mau pesan apa?";
        } else if (!validPickup) {
          finalReply =
            "⚠️ Mohon maaf Kak, lokasi pengambilan (Warung/Toko) belum ada. Mau beli di mana?";
        } else if (!validAddress) {
          finalReply =
            "⚠️ Mohon maaf Kak, *Alamat Pengantaran* belum diisi nih.\n\nMau diantar ke mana? (Silahkan ketik Nama Jalan, No Rumah/Patokan)";
        } else {
          // DATA LENGKAP -> EKSEKUSI
          // Update Status di Database
          await draftOrder.update({ status: "LOOKING_FOR_DRIVER" });

          // Update Data User (Simpan alamat terakhir)
          await user.update({
            address_text: draftOrder.delivery_address,
            last_order_date: new Date(),
          });

          // TRIGGER DISPATCHER (PANGGIL KURIR)
          // Jalankan secara background (tanpa await) agar user langsung dapat balasan
          dispatchService
            .findDriverForOrder(draftOrder.order_id)
            .catch((err) => console.error("❌ Dispatch Error:", err));

          // Balas ke User
          finalReply =
            "✅ *Pesanan Dikonfirmasi!*\n\nSistem sedang mencarikan kurir terdekat. Mohon tunggu sebentar yah kak...";
        }
      } else if (activeOrder) {
        finalReply = "Pesanan sedang diproses ya Kak. Mohon ditunggu.";
      } else {
        finalReply = "Siap Kak! Ada yang bisa saya bantu pesankan lagi?";
      }
    }
    // Order Process
    else if (["ORDER_INCOMPLETE", "ORDER_COMPLETE"].includes(aiResult.intent)) {
      // UPDATE DATABASE (Simpan data parsial/lengkap)
      if (draftOrder) {
        await draftOrder.update({
          items_summary: mergedItems,
          pickup_address: mergedPickup,
          delivery_address: mergedAddress,
          raw_message: text,
        });
      } else {
        // Jika items kosong di awal, tolak pembuatan draft
        if (mergedItems.length === 0) {
          return { reply: "Halo Kak! Mau pesan menu apa hari ini?" };
        }

        const addr = mergedAddress || user.address_text || "";
        await orderService.createFromAI(phone, {
          items: mergedItems,
          pickup_location: mergedPickup,
          delivery_address: addr,
          original_message: text,
        });
      }

      // VALIDASI KELENGKAPAN DATA (Cek Ulang)
      // Cek merged data + data history user
      const finalAddress = mergedAddress || draftOrder?.delivery_address || user.address_text || "";

      const hasItems = mergedItems.length > 0;
      const hasPickup = mergedPickup && mergedPickup.length > 2;
      const hasAddress = finalAddress && finalAddress.length > 3;

      // TENTUKAN BALASAN (Conditional Reply)
      if (hasItems && hasPickup && hasAddress) {
        // DATA LENGKAP -> Tampilkan Struk Konfirmasi
        finalReply = formatSummaryReply(name, mergedItems, mergedPickup, finalAddress);
      } else {
        // DATA BELUM LENGKAP -> Tanya Kekurangannya Saja (Jangan kasih struk)

        if (!hasItems) {
          finalReply = "Siap Kak. Mau pesan menu apa?";
        } else if (!hasPickup) {
          // Ambil nama menu pertama buat konteks
          const menuName = mergedItems[0].item || "makanan";
          finalReply = `Oke, pesan *${menuName}*. Mau dibelikan di warung/toko mana Kak?`;
        } else {
          // kurang alamat
          finalReply = `Siap, *${mergedItems[0].item}* dari *${mergedPickup}*.\n\nMau diantar ke alamat mana Kak? (Tulis nama jalan/patokan)`;
        }
      }
    }
    // Fallback
    else {
      if (!finalReply)
        finalReply =
          "Halo Kak! Saya bot khusus pemesanan kurir. Ada yang bisa saya bantu pesankan?";
    }

    await session.update({ last_interaction: new Date() });
    return { reply: finalReply };
  } catch (error) {
    console.error("❌ User Flow Error:", error);
    await session.update({ mode: "HUMAN" });
    return { reply: "⚠️ Maaf, terjadi kendala teknis. Saya alihkan ke Admin sebentar ya." };
  }
};
