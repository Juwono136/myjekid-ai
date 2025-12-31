import { Order, Courier, sequelize } from "../models/index.js";

class OrderService {
  /**
   * Membuat Order Baru dari Data Ekstraksi AI
   * @param {string} userPhone - Nomor HP User
   * @param {object} aiData - Objek data dari AI { items: [], delivery_address: "" }
   */
  async createFromAI(userPhone, aiData) {
    try {
      // Gunakan Format timestamp agar unik
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Hitung estimasi total
      const estimatedTotal = 0;

      // Simpan ke Database
      const newOrder = await Order.create({
        order_id: orderId,
        user_phone: userPhone,
        raw_message: aiData.original_message || "Order from Bot",
        items_summary: aiData.items,
        pickup_address: aiData.pickup_location || "",
        delivery_address: aiData.delivery_address || "",
        total_amount: estimatedTotal,
        status: "DRAFT",
      });

      console.log(`✅ Order Created: ${newOrder.order_id} for ${userPhone}`);
      return newOrder;
    } catch (error) {
      console.error("❌ Create Order Error:", error);
      throw error;
    }
  }

  // Kurir Mengambil Order
  async takeOrder(orderId, courierId) {
    const transaction = await sequelize.transaction();
    try {
      const order = await Order.findOne({
        where: { order_id: orderId },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (!order) throw new Error("Order tidak ditemukan.");
      if (order.status !== "LOOKING_FOR_DRIVER" && order.status !== "OFFERED") {
        throw new Error("Order sudah diambil atau dibatalkan.");
      }

      await order.update({ status: "ON_PROCESS", courier_id: courierId }, { transaction });
      await Courier.update({ status: "BUSY" }, { where: { id: courierId }, transaction });

      await transaction.commit();
      return { success: true, data: order };
    } catch (error) {
      await transaction.rollback();
      return { success: false, message: error.message };
    }
  }

  // Simpan Draft Tagihan (Hasil AI atau Edit Manual)
  async saveBillDraft(orderId, amount, imageUrl = null) {
    const updateData = { total_amount: amount, status: "BILL_VALIDATION" };
    if (imageUrl) updateData.invoice_image_url = imageUrl;

    return await Order.update(updateData, { where: { order_id: orderId } });
  }

  // Finalisasi Tagihan (Siap dikirim ke User)
  async finalizeBill(orderId) {
    const transaction = await sequelize.transaction();
    try {
      const order = await Order.findOne({ where: { order_id: orderId }, transaction });

      if (order.status !== "BILL_VALIDATION") return null; // Sudah diproses/batal

      await order.update({ status: "BILL_SENT" }, { transaction });

      await transaction.commit();
      return order; // Return data order untuk dikirim ke messageService
    } catch (error) {
      await transaction.rollback();
      return null;
    }
  }

  // 4. Selesaikan Order
  async completeOrder(orderId, courierId) {
    const transaction = await sequelize.transaction();
    try {
      await Order.update(
        { status: "COMPLETED", completed_at: new Date() },
        { where: { order_id: orderId }, transaction }
      );

      await Courier.update(
        { status: "IDLE", last_job_time: new Date() },
        { where: { id: courierId }, transaction }
      );

      await transaction.commit();
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      return { success: false, message: error.message };
    }
  }
}

export const orderService = new OrderService();
