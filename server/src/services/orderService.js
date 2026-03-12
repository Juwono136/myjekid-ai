import { Order, Courier, User, sequelize } from "../models/index.js";
import { redisClient } from "../config/redisClient.js";

const SHIFT_1_START = Number(process.env.SHIFT_1_START) || 6;
const SHIFT_1_END = Number(process.env.SHIFT_1_END) || 14;
const SHIFT_2_START = Number(process.env.SHIFT_2_START) || 14;
const SHIFT_2_END = Number(process.env.SHIFT_2_END) || 22;

function isInShiftNow(shiftCode, date = new Date()) {
  const hour = date.getHours();
  if (shiftCode === 1) return hour >= SHIFT_1_START && hour < SHIFT_1_END;
  if (shiftCode === 2) return hour >= SHIFT_2_START && hour < SHIFT_2_END;
  return false;
}

class OrderService {
  // Membuat Order Baru dari Data Ekstraksi AI
  async createFromAI(userPhone, aiData) {
    try {
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const shortCode = await this.generateShortCode();

      const chatMessages = Array.isArray(aiData.chat_messages)
        ? aiData.chat_messages
        : aiData.original_message
        ? [aiData.original_message]
        : [];
      const newOrder = await Order.create({
        order_id: orderId,
        short_code: shortCode,
        user_phone: userPhone,
        chat_messages: chatMessages,
        total_amount: 0,
        status: "DRAFT",
      });
      await User.update({ order_id: orderId }, { where: { phone: userPhone } });

      console.log(`✅ Order Created: ${newOrder.order_id} for ${userPhone}`);
      return newOrder;
    } catch (error) {
      console.error("❌ Create Order Error:", error);
      throw error;
    }
  }

  async generateShortCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let code = "";
      for (let i = 0; i < 4; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const exists = await Order.findOne({ where: { short_code: code } });
      if (!exists) return code;
    }
    return `K${Math.floor(1000 + Math.random() * 9000)}`;
  }

  /**
   * Buat order oleh admin (intervensi manual). Status langsung LOOKING_FOR_DRIVER.
   * Jika user_phone belum ada di User, akan dibuat user baru.
   */
  async createByAdmin(payload) {
    const { user_phone, customer_name, chat_messages: chatMessagesPayload } = payload;

    const normalizedPhone = String(user_phone || "").trim();
    if (!normalizedPhone) {
      throw new Error("Nomor HP pelanggan wajib diisi.");
    }

    let user = await User.findByPk(normalizedPhone);
    if (!user) {
      user = await User.create({
        phone: normalizedPhone,
        name: (customer_name || "").trim() || "Pelanggan",
      });
    } else if (customer_name && String(customer_name).trim()) {
      await user.update({ name: String(customer_name).trim() });
    }

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const shortCode = await this.generateShortCode();

    const chatMessages = Array.isArray(chatMessagesPayload)
      ? chatMessagesPayload.map((m) => (typeof m === "string" ? m : m?.body ?? String(m)))
      : [];

    const newOrder = await Order.create({
      order_id: orderId,
      short_code: shortCode,
      user_phone: user.phone,
      chat_messages: chatMessages.length ? chatMessages : ["Order dibuat oleh admin"],
      total_amount: 0,
      status: "LOOKING_FOR_DRIVER",
    });
    await User.update({ order_id: orderId }, { where: { phone: user.phone } });

    console.log(`✅ Order by Admin: ${newOrder.order_id} for ${user.phone}`);
    return { order: newOrder, user };
  }

  // KURIR MENGAMBIL ORDER
  async takeOrder(orderIdString, courierId) {
    const transaction = await sequelize.transaction();
    try {
      // Tambahkan 'required: true' agar menjadi INNER JOIN.
      // Ini mengatasi error "FOR UPDATE cannot be applied to the nullable side"
      const order = await Order.findOne({
        where: { order_id: orderIdString },
        include: [
          {
            model: User,
            as: "user",
            required: true,
          },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const courier = await Courier.findByPk(courierId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!courier) {
        await transaction.rollback();
        return { success: false, message: "Kurir tidak ditemukan." };
      }

      if (courier.status !== "IDLE" || courier.is_active === false) {
        await transaction.rollback();
        return {
          success: false,
          message: "Status kamu belum idle. Hubungi admin untuk mengaktifkan.",
        };
      }

      if (!order) {
        await transaction.rollback();
        return { success: false, message: "Order tidak ditemukan." };
      }

      if (order.status !== "LOOKING_FOR_DRIVER") {
        await transaction.rollback();
        return { success: false, message: "Yah, Order ini sudah diambil kurir lain! 🐢" };
      }

      // Update Order
      await order.update(
        {
          status: "ON_PROCESS",
          courier_id: courierId,
          taken_at: new Date(),
        },
        { transaction }
      );

      // Update Status Kurir
      await Courier.update(
        {
          status: "BUSY",
          current_order_id: orderIdString,
        },
        { where: { id: courierId }, transaction }
      );

      await transaction.commit();

      // Return Data Sukses
      return { success: true, data: order };
    } catch (error) {
      await transaction.rollback();
      console.error("Take Order Error:", error);
      return { success: false, message: "Mohon maaf, sistem sedang sibuk, coba sesaat lagi." };
    }
  }

  // Simpan Draft Scan Tagihan (Sementara). Saat pertama (dari struk) set receipt_total; saat revisi kurir hanya update total_amount.
  async saveBillDraft(orderId, total, imageUrl) {
    const order = await Order.findOne({ where: { order_id: orderId }, attributes: ["status", "receipt_total", "invoice_image_url"] });
    if (!order) return null;
    const updates = {
      total_amount: total,
      invoice_image_url: imageUrl || order.invoice_image_url,
      status: "BILL_VALIDATION",
    };
    // receipt_total = total dari struk (OCR). Jika kurir kirim ulang struk (replace) saat ON_PROCESS/BILL_VALIDATION,
    // update receipt_total agar mencerminkan struk terbaru. Revisi manual (ketik angka) tidak mengubah receipt_total.
    const isReceiptScan =
      Boolean(imageUrl) && ["ON_PROCESS", "BILL_VALIDATION"].includes(order.status);
    const isNewReceiptImage =
      Boolean(imageUrl) && String(imageUrl) !== String(order.invoice_image_url || "");
    if (isReceiptScan && (order.receipt_total == null || isNewReceiptImage)) {
      updates.receipt_total = total;
    }
    const [affected] = await Order.update(updates, { where: { order_id: orderId } });
    return affected;
  }

  // Finalisasi Tagihan (Siap dikirim ke User)
  async finalizeBill(orderId) {
    const transaction = await sequelize.transaction();
    try {
      const order = await Order.findOne({ where: { order_id: orderId }, transaction });

      if (order.status !== "BILL_VALIDATION") return null;

      await order.update({ status: "BILL_SENT" }, { transaction });

      await transaction.commit();
      return order;
    } catch (error) {
      await transaction.rollback();
      return null;
    }
  }

  // Selesaikan Order
  async completeOrder(orderId, courierId) {
    const transaction = await sequelize.transaction();
    try {
      const order = await Order.findOne({ where: { order_id: orderId }, attributes: ["user_phone"], transaction });
      const courier = await Courier.findOne({
        where: { id: courierId },
        attributes: ["id", "shift_code", "is_active", "status"],
        transaction,
      });
      await Order.update(
        { status: "COMPLETED", completed_at: new Date() },
        { where: { order_id: orderId }, transaction }
      );

      // Jika shift kurir sudah lewat, jangan langsung OFFLINE saat masih BUSY.
      // Tapi saat order selesai dan kurir kembali IDLE, baru boleh OFFLINE jika memang sudah di luar jam shift.
      const nextStatus =
        courier && courier.is_active && isInShiftNow(courier.shift_code) ? "IDLE" : "OFFLINE";

      await Courier.update(
        { status: nextStatus, last_job_time: new Date(), current_order_id: null },
        { where: { id: courierId }, transaction }
      );
      if (order?.user_phone) {
        await User.update({ order_id: null, last_order_date: new Date() }, { where: { phone: order.user_phone }, transaction });
      }
      await transaction.commit();

      // Sinkronkan set online_couriers untuk dispatch (di luar transaksi DB).
      try {
        if (nextStatus === "IDLE") {
          await redisClient.sAdd("online_couriers", String(courierId));
        } else {
          await redisClient.sRem("online_couriers", String(courierId));
        }
      } catch (e) {
        console.error("Redis online_couriers sync error:", e.message);
      }

      return true;
    } catch (error) {
      await transaction.rollback();
      console.error("Complete Order Error:", error);
      return false;
    }
  }
}

export const orderService = new OrderService();