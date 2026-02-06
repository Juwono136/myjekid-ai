import { Order, Courier, User, sequelize } from "../models/index.js";

class OrderService {
  // Membuat Order Baru dari Data Ekstraksi AI
  async createFromAI(userPhone, aiData) {
    try {
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const shortCode = await this.generateShortCode();

      const newOrder = await Order.create({
        order_id: orderId,
        short_code: shortCode,
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
    const {
      user_phone,
      customer_name,
      pickup_address,
      delivery_address,
      items_summary,
      order_notes,
      latitude,
      longitude,
    } = payload;

    const normalizedPhone = String(user_phone || "").trim();
    if (!normalizedPhone) {
      throw new Error("Nomor HP pelanggan wajib diisi.");
    }

    let user = await User.findByPk(normalizedPhone);
    if (!user) {
      user = await User.create({
        phone: normalizedPhone,
        name: (customer_name || "").trim() || "Pelanggan",
        ...(latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude))
          ? { latitude: Number(latitude), longitude: Number(longitude) }
          : {}),
      });
    } else {
      const updates = {};
      if (customer_name && String(customer_name).trim()) updates.name = String(customer_name).trim();
      if (latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude))) {
        updates.latitude = Number(latitude);
        updates.longitude = Number(longitude);
      }
      if (Object.keys(updates).length) await user.update(updates);
    }

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const shortCode = await this.generateShortCode();

    const notesArray = Array.isArray(order_notes)
      ? order_notes
          .map((n) => (typeof n === "string" ? n : n?.note))
          .filter(Boolean)
          .map((note) => ({ note, at: new Date().toISOString() }))
      : [];

    const items = Array.isArray(items_summary)
      ? items_summary.map((i) => ({
          item: i.item || "Item",
          qty: Number(i.qty) || 1,
          note: i.note || "",
        }))
      : [];

    const newOrder = await Order.create({
      order_id: orderId,
      short_code: shortCode,
      user_phone: user.phone,
      raw_message: "Order dibuat oleh admin",
      items_summary: items,
      order_notes: notesArray,
      pickup_address: pickup_address || "",
      delivery_address: delivery_address || "",
      total_amount: 0,
      status: "LOOKING_FOR_DRIVER",
    });

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
          message: "Status kamu belum online. Ketik #SIAP untuk menerima order baru.",
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