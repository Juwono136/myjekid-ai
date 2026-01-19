import { User, ChatSession, Order } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";

// ID Generator Helper
const generateOrderId = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export const handleUserMessage = async (
  phone,
  name,
  text,
  rawSenderId,
  locationData = null,
  imageData = null,
  io = null,
) => {
  try {
    // 1. Load/Create User
    let user = await User.findOne({ where: { phone } });
    if (!user) {
      console.log(`👤 New User Detected: ${name}`);
      user = await User.create({
        phone,
        name: name || "Pelanggan",
        device_id: rawSenderId,
      });
    }

    // 2. Cek Session (HUMAN vs BOT)
    let session = await ChatSession.findOne({ where: { phone } });

    // Jika sesi belum ada, buat baru sebagai BOT
    if (!session) {
      session = await ChatSession.create({ phone, mode: "BOT" });
    }

    // [DIAGNOSTIC] Log mode saat ini
    console.log(`ℹ️ Session Mode for ${phone}: ${session.mode}`);

    // JIKA MODE HUMAN: Return null agar controller mengirim 'no_action' ke n8n
    // (Pesan masuk ke dashboard admin, tapi bot WA diam)
    if (session.mode === "HUMAN") {
      console.log("🚫 Bot silenced (Mode: HUMAN)");
      return null;
    }

    // 3. Update Lokasi jika ada
    if (locationData) {
      await user.update({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address_text: locationData.address || user.address_text,
      });
      text += " [SYSTEM: User mengirim Share Location]";
    }

    // 4. Handle Image (Struk)
    if (imageData && imageData.url) {
      const billAmount = await aiService.analyzeReceiptImage(imageData.url);
      if (billAmount > 0) {
        text += ` [SYSTEM: Gambar Struk terdeteksi. Total: Rp ${billAmount}]`;
      } else {
        text += ` [SYSTEM: Gambar diterima tapi tidak terdeteksi sebagai struk yang valid.]`;
      }
    }

    // 5. Load Draft Order
    let draftOrder = await Order.findOne({
      where: { user_phone: phone, status: "DRAFT" },
      order: [["created_at", "DESC"]],
    });

    // 6. 🧠 AI PROCESSING (Ini yang memakan waktu 2-5 detik)
    console.log("🤖 Calling AI Agent...");
    const agentResult = await aiService.chatWithAgent(user, draftOrder, text);
    const { reply_text, extracted_data, intent } = agentResult;
    console.log(`🤖 AI Replied: "${reply_text?.substring(0, 30)}..."`);

    // 7. Update Database (Order Logic)
    if (intent === "ORDER_FLOW" || intent === "CHITCHAT") {
      const hasNewData =
        extracted_data &&
        (extracted_data.items?.length > 0 ||
          extracted_data.pickup_address ||
          extracted_data.delivery_address);

      if (hasNewData) {
        if (!draftOrder) {
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

      // Finalisasi
      if (extracted_data && extracted_data.is_finalized) {
        if (!user.latitude || !user.longitude) {
          // Minta lokasi
          return { reply: reply_text + "\n\n📍 *Mohon Share Location dulu ya kak.*" };
        }
        if (draftOrder) await draftOrder.update({ status: "PENDING_CONFIRMATION" });
      }
    } else if (intent === "CANCEL" && draftOrder) {
      await draftOrder.update({ status: "CANCELLED" });
    }

    // Update timestamp
    await session.update({ last_interaction: new Date() });

    // 8. Return Reply ke Controller
    return { reply: reply_text };
  } catch (error) {
    console.error("❌ UserFlow Error:", error);
    // Return pesan error sopan agar bot tidak diam total saat error
    return { reply: "Maaf kak, sistem sedang gangguan sebentar. 🙏" };
  }
};
