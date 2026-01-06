import { Order, Courier, User, sequelize } from "../models/index.js"; // Pastikan import User

class OrderService {
  /**
   * Membuat Order Baru dari Data Ekstraksi AI
   */
  async createFromAI(userPhone, aiData) {
    try {
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newOrder = await Order.create({
        order_id: orderId,
        user_phone: userPhone,
        raw_message: aiData.original_message || "Order from Bot",
        items_summary: aiData.items,
        pickup_address: aiData.pickup_location || "",
        delivery_address: aiData.delivery_address || "",
        total_amount: 0,
        status: "DRAFT",
      });

      console.log(`✅ Order Created: ${newOrder.order_id} for ${userPhone}`);
      return newOrder;
    } catch (error) {
      console.error("❌ Create Order Error:", error);
      throw error;
    }
  }

  // --- [UPDATE] KURIR MENGAMBIL ORDER ---
  async takeOrder(orderIdString, courierId) {
    const transaction = await sequelize.transaction();
    try {
      // [PERBAIKAN KRUSIAL DISINI]
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
        lock: transaction.LOCK.UPDATE, // Kunci baris agar tidak balapan
      });

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
      console.error("❌ Take Order Error:", error); // Debugging
      return { success: false, message: "Sistem sedang sibuk, coba sesaat lagi." };
    }
  }

  // Simpan Draft Scan Tagihan (Sementara)
  async saveBillDraft(orderId, total, imageUrl) {
    return await Order.update(
      {
        total_amount: total,
        invoice_image_url: imageUrl,
        status: "BILL_VALIDATION",
      },
      { where: { order_id: orderId } }
    );
  }

  // Finalisasi Tagihan (Siap dikirim ke User)
  async finalizeBill(orderId) {
    const transaction = await sequelize.transaction();
    try {
      const order = await Order.findOne({ where: { order_id: orderId }, transaction });

      if (order.status !== "BILL_VALIDATION") return null;

      await order.update({ status: "BILL_SENT" }, { transaction });

      await transaction.commit();
      return order; // Return order agar Flow bisa kirim pesan ke user
    } catch (error) {
      await transaction.rollback();
      return null;
    }
  }

  // Selesaikan Order
  async completeOrder(orderId, courierId) {
    const transaction = await sequelize.transaction();
    try {
      await Order.update(
        { status: "COMPLETED", completed_at: new Date() },
        { where: { order_id: orderId }, transaction }
      );

      await Courier.update(
        { status: "IDLE", last_job_time: new Date(), current_order_id: null },
        { where: { id: courierId }, transaction }
      );

      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      console.error("Complete Order Error:", error);
      return false;
    }
  }
}

export const orderService = new OrderService();
