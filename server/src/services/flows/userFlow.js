import { Op } from "sequelize";
import { User, ChatSession, Order, Courier, sequelize } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";
import { SUMBAWA_PLACES } from "../../constants/sumbawaPlaces.js";
import { sanitizePhoneNumber } from "../../utils/formatter.js";
import { redisClient } from "../../config/redisClient.js";
import { dispatchService } from "../dispatchService.js";
import { messageService } from "../messageService.js";
import { orderService } from "../orderService.js";

/** Greeting pertama untuk semua pelanggan — waktu dinamis Pagi/Siang/Sore/Malam */
function getFirstMessageGreeting() {
  const hour = new Date().getHours();
  let waktu = "Pagi";
  if (hour >= 12 && hour < 15) waktu = "Siang";
  else if (hour >= 15 && hour < 18) waktu = "Sore";
  else if (hour >= 18 || hour < 4) waktu = "Malam";
  return (
    `Hallo kak, Wa'alaykumsalam wr wb, Selamat ${waktu} 🙏🤗\n\n` +
    `Selamat datang di MyJek - Aplikasi Pemesanan Antar Barang (Antar/Jemput) 🙏🤗\n\n` +
    `Agar cepat diproses, boleh bantu kirim detail orderannya kak\n\n` +
    `Belanja/jemput, beli apa dimana, jumlahnya berapa, antar/jemput dimana\n\n` +
    `Tolong tulis sejelas mungkin ya kak 🙏🤗`
  );
}

/** Balasan singkat setelah pelanggan konfirmasi (ok/ya) */
const ORDER_CONFIRMED_SHORT =
  "Pesanan sudah kami terima dan sedang dicarikan kurir. Kurir akan menghubungi kakak langsung. Terima kasih! 🙏";

/** Pesan konfirmasi order sebelum diproses */
const ORDER_CONFIRM_MESSAGE =
  `Pesanan kakak sudah kami terima. 💯\n` +
  `Apakah sudah dapat kami proses sekarang ? Balas Ok/Ya.\n` +
  `jika dalam waktu 1 menit tidak ada respon kami anggap anda setuju untuk diproses oleh Rider kami 🫰\n` +
  `-----------------------------------------------------------------\n` +
  `- Gratis ongkir 5x 🥳 untuk anda jika anda menemukan rider yang melayani tidak mengunakan atribut (Jaket/kaos) MyJek Kecuali saat Hujan. Jangan lupa sertakan bukti foto yaaa\n` +
  `- Tarif Khusus untuk kondisi: Cuaca Hujan & Belanja Pasar\n` +
  `- Pesanan bisa dibatalkan dengan ketik "batal order" selama kurir belum memproses pesanan kakak 😊🙏\n` +
  `- Pesanan Tambahan/Revisi Order & Pembayaran via transfer dapat langsung berkomunikasi dengan rider kami\n` +
  `🙏😊\n\n` +
  `-----------------------------------------------------------------\n` +
  `💬 Jika terjadi kendala atau masalah, silahkan ketik #HUMAN jika ingin berbicara langsung dengan admin kami yah kak. 😅🙏`;

export const handleUserMessage = async (
  phone,
  name,
  text,
  rawSenderId,
  locationData = null,
  io = null,
  options = {}
) => {
  const cleanText = (text || "").trim();
  const orderChatBodies = options.orderChatBodies || (cleanText ? [cleanText] : []);

  // 1. Find or Create User
  let user = await User.findOne({
    where: sequelize.or({ phone }, { device_id: rawSenderId }, { phone: rawSenderId }),
  });
  if (!user) {
    const normalizedPhone = sanitizePhoneNumber(phone) || phone?.replace?.(/[^0-9]/g, "") || null;
    if (normalizedPhone) {
      user = await User.create({
        phone: normalizedPhone,
        name: name || "Pelanggan",
        device_id: rawSenderId,
      });
    } else {
      return { reply: getFirstMessageGreeting() };
    }
  }

  const realPhone = user.phone;

  // 2. Check Session (HUMAN mode)
  const [session] = await ChatSession.findOrCreate({
    where: { phone: realPhone },
    defaults: { mode: "BOT", last_interaction: new Date() },
  });

  const isNewSession = !session.last_interaction || (Date.now() - new Date(session.last_interaction).getTime() > 60 * 60 * 1000);
  
  // Update last interaction for future messages
  await session.update({ last_interaction: new Date() });

  if (session.mode === "HUMAN") {
    return null; // Bot diam
  }

  // 3. Get Active/Draft Orders
  const [draftOrder, activeOrder] = await Promise.all([
    Order.findOne({
      where: { user_phone: realPhone, status: { [Op.in]: ["DRAFT", "PENDING_CONFIRMATION"] } },
      order: [["created_at", "DESC"]],
    }),
    Order.findOne({
      where: {
        user_phone: realPhone,
        status: { [Op.in]: ["LOOKING_FOR_DRIVER", "ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
      },
      order: [["created_at", "DESC"]],
    }),
  ]);

  // 4. Parse Intent using AI
  const contextData = {
    user_name: user.name,
    current_order_status: draftOrder ? draftOrder.status : activeOrder ? activeOrder.status : "NONE",
  };
  
  let intent = "OTHER";
  try {
    const aiResult = await aiService.parseIntent(cleanText, contextData);
    if (aiResult && aiResult.intent) {
      intent = aiResult.intent;
    }
  } catch (error) {
    console.error("AI Parse Intent Error:", error);
  }

  // Handle Manual #HUMAN command (auto-revert ke BOT setelah 5 jam via scheduler)
  if (cleanText.toUpperCase() === "#HUMAN" || intent === "HUMAN_HANDOFF") {
    await session.update({ mode: "HUMAN", human_since: new Date() });
    return { reply: "Baik kak, percakapan ini telah dialihkan ke admin. Mohon tunggu sebentar ya 🙏" };
  }

  // Rekomendasi tempat makan/minum/wisata di Sumbawa (dinamis: AI pilih & format dari catalog tempat)
  if (intent === "REKOMENDASI_TEMPAT") {
    try {
      const places = await aiService.getSumbawaPlaces();
      const reply = await aiService.generatePlaceRecommendationReply(
        places,
        cleanText,
        user.name
      );
      return { reply };
    } catch (err) {
      console.error("Rekomendasi tempat error:", err);
      return {
        reply:
          "Maaf kak, informasi rekomendasi tempat sedang tidak bisa diakses. Silakan coba lagi atau ketik #HUMAN untuk bantuan admin 🙏",
      };
    }
  }

  // 5. Handle Intents
  if (intent === "GREETING") {
    return { reply: getFirstMessageGreeting() };
  }

  if (intent === "CANCELLATION") {
    if (draftOrder) {
      const orderIdToClear = draftOrder.order_id;
      await draftOrder.update({ status: "CANCELLED" });
      await redisClient.zRem("order_confirm_waiting", orderIdToClear);
      await User.update({ order_id: null }, { where: { order_id: orderIdToClear } });
      return { reply: "Pesanan kakak sudah kami batalkan ya. Terima kasih! 🙏" };
    } else if (activeOrder && activeOrder.status === "LOOKING_FOR_DRIVER") {
      const orderIdToClear = activeOrder.order_id;
      await activeOrder.update({ status: "CANCELLED" });
      await User.update({ order_id: null }, { where: { order_id: orderIdToClear } });
      return { reply: "Pesanan kakak sudah kami batalkan ya. Terima kasih! 🙏" };
    } else if (activeOrder) {
      return { reply: "Maaf kak, pesanan sudah diproses oleh kurir dan tidak dapat dibatalkan melalui bot. Silakan hubungi kurir langsung atau ketik #HUMAN." };
    } else {
      return { reply: "Tidak ada pesanan aktif yang bisa dibatalkan kak." };
    }
  }

  if (intent === "CONFIRMATION") {
    if (draftOrder && draftOrder.status === "PENDING_CONFIRMATION") {
      await draftOrder.update({ status: "LOOKING_FOR_DRIVER" });
      await redisClient.zRem("order_confirm_waiting", draftOrder.order_id);
      
      dispatchService.findDriverForOrder(draftOrder.order_id).catch((err) => console.error("Dispatch Error:", err));
      
      return { reply: ORDER_CONFIRMED_SHORT };
    } else if (activeOrder) {
      return { reply: "Pesanan kakak sedang diproses ya. Mohon ditunggu 🙏" };
    } else {
      return { reply: "Belum ada pesanan yang perlu dikonfirmasi kak. Silakan tulis pesanan kakak." };
    }
  }

  if (intent === "CHECK_STATUS") {
    if (activeOrder) {
      return { reply: `Pesanan kakak saat ini berstatus: ${activeOrder.status}. Mohon ditunggu ya kak 🙏` };
    } else if (draftOrder) {
      return { reply: "Pesanan kakak masih menunggu konfirmasi. Balas Ok/Ya untuk memproses." };
    } else {
      return { reply: "Kakak belum memiliki pesanan aktif saat ini." };
    }
  }

  // Default to ORDER intent for any other messages that might contain order details
  if (intent === "ORDER") {
    if (activeOrder) {
      return { reply: "Pesanan kakak sedang ditangani kurir. Untuk pesanan tambahan atau revisi, silakan komunikasi langsung dengan kurir. Terima kasih! 🙏" };
    }

    if (draftOrder) {
      // Append to existing draft
      const existingChats = Array.isArray(draftOrder.chat_messages) ? draftOrder.chat_messages : [];
      await draftOrder.update({
        chat_messages: [...existingChats, ...orderChatBodies],
        status: "PENDING_CONFIRMATION"
      });
      // Reset the 1-minute timer
      await redisClient.zAdd("order_confirm_waiting", { score: Date.now(), value: draftOrder.order_id });
      return { reply: ORDER_CONFIRM_MESSAGE };
    } else {
      // Create new draft
      const newOrder = await orderService.createFromAI(realPhone, {
        items: [],
        pickup_location: "",
        delivery_address: "",
        original_message: cleanText,
        chat_messages: orderChatBodies,
      });
      
      await newOrder.update({ status: "PENDING_CONFIRMATION" });
      await redisClient.zAdd("order_confirm_waiting", { score: Date.now(), value: newOrder.order_id });
      
      let replyMsg = ORDER_CONFIRM_MESSAGE;
      if (isNewSession) {
        replyMsg = getFirstMessageGreeting() + "\n\n" + ORDER_CONFIRM_MESSAGE;
      }
      
      return { reply: replyMsg };
    }
  }

  // Fallback for OTHER or CHITCHAT
  if (intent === "OTHER" || intent === "CHITCHAT") {
    // If it's just a polite response like "makasih", "oke" (but not confirmation)
    if (cleanText.toLowerCase().includes("makasih") || cleanText.toLowerCase().includes("terima kasih")) {
      return { reply: "Sama-sama kak! 🙏" };
    }
    return { reply: "Maaf kak, saya kurang paham. Silakan ketik pesanan kakak dengan jelas atau ketik #HUMAN untuk bicara dengan admin." };
  }

  // Fallback
  return { reply: "Maaf kak, saya kurang paham. Silakan ketik pesanan kakak atau ketik #HUMAN untuk bicara dengan admin." };
};
