import { User, ChatSession, Order } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";
import { sanitizePhoneNumber } from "../../utils/formatter.js";

// ID Generator Helper
const generateOrderId = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export const handleUserMessage = async (
  phone,
  name,
  text,
  rawSenderId,
  locationData = null,
  imageData = null, // <-- Parameter Gambar
  io = null,
) => {
  try {
    // 1. LOAD / CREATE USER
    let user = await User.findOne({ where: { phone } });
    if (!user) {
      user = await User.create({
        phone,
        name: name || "Pelanggan",
        device_id: rawSenderId,
      });
    }

    // 2. CEK SESSION (HUMAN vs BOT)
    let session = await ChatSession.findOne({ where: { phone } });
    if (!session) {
      session = await ChatSession.create({ phone, mode: "BOT" });
    }
    if (session.mode === "HUMAN") return null; // Serahkan ke Admin

    // 3. HANDLE LOCATION UPDATE
    if (locationData) {
      await user.update({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address_text: locationData.address || user.address_text,
      });
      text += " [SYSTEM: User baru saja mengirim Share Location (Peta)]";
    }

    // 4. HANDLE IMAGE (KHUSUS STRUK)
    if (imageData && imageData.url) {
      // Panggil AI Vision khusus Struk
      const billAmount = await aiService.analyzeReceiptImage(imageData.url);

      if (billAmount > 0) {
        // Jika terdeteksi angka, infokan ke Agent
        text += ` [SYSTEM: User mengirim gambar STRUK/NOTA. AI Vision membaca Total Tagihan: Rp ${billAmount}. Gunakan info ini untuk verifikasi order/pembayaran.]`;
      } else {
        // Jika gambar tidak jelas atau bukan struk
        text += ` [SYSTEM: User mengirim gambar, tapi AI tidak menemukan nominal uang di dalamnya.]`;
      }
    }

    // 5. LOAD DRAFT ORDER (Context)
    let draftOrder = await Order.findOne({
      where: { user_phone: phone, status: "DRAFT" },
      order: [["created_at", "DESC"]],
    });

    // 6. 🧠 TANYA AI AGENT
    const agentResult = await aiService.chatWithAgent(user, draftOrder, text);
    const { reply_text, extracted_data, intent } = agentResult;

    // 7. EKSEKUSI DATABASE BERDASARKAN HASIL AGENT
    if (intent === "ORDER_FLOW" || intent === "CHITCHAT") {
      const hasNewData =
        extracted_data &&
        (extracted_data.items?.length > 0 ||
          extracted_data.pickup_address ||
          extracted_data.delivery_address);

      if (hasNewData) {
        if (!draftOrder) {
          // Buat Order Baru
          draftOrder = await Order.create({
            order_id: generateOrderId(),
            user_phone: phone,
            status: "DRAFT",
            raw_message: text,
            items_summary: extracted_data.items || [],
            pickup_address: extracted_data.pickup_address || "",
            delivery_address: extracted_data.delivery_address || user.address_text || "",
          });
        } else {
          // Update Order Lama
          await draftOrder.update({
            items_summary:
              extracted_data.items && extracted_data.items.length > 0
                ? extracted_data.items
                : draftOrder.items_summary,
            pickup_address: extracted_data.pickup_address || draftOrder.pickup_address,
            delivery_address: extracted_data.delivery_address || draftOrder.delivery_address,
          });
        }
      }

      // 8. FINALISASI ORDER
      if (extracted_data && extracted_data.is_finalized) {
        // Validasi Akhir: Wajib ada Koordinat
        if (!user.latitude || !user.longitude) {
          return {
            reply:
              reply_text +
              "\n\n📍 *Mohon maaf kak, sebelum lanjut, tolong kirim Share Location (Peta) dulu ya agar kurir tidak nyasar.* (Klik 📎 -> Location)",
          };
        }

        // Ubah status jadi PENDING (Siap cari driver)
        if (draftOrder) {
          await draftOrder.update({ status: "PENDING_CONFIRMATION" });
          // Optional: Trigger dispatchService.findDriverForOrder(draftOrder.order_id);
        }
      }
    }

    // Handle Cancel
    else if (intent === "CANCEL") {
      if (draftOrder) await draftOrder.update({ status: "CANCELLED" });
    }

    // Update timestamp session
    await session.update({ last_interaction: new Date() });

    // 9. RETURN REPLY
    return { reply: reply_text };
  } catch (error) {
    console.error("UserFlow Error:", error);
    return { reply: "Maaf kak, sistem sedang sibuk. Mohon coba lagi nanti ya 🙏" };
  }
};
