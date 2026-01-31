import { Op } from "sequelize";
import { Courier, Order, User } from "../models/index.js";
import { messageService } from "./messageService.js";
import { redisClient } from "../config/redisClient.js";

export const dispatchService = {
  async offerPendingOrdersToCourier(courier, limit = 3) {
    if (!courier || courier.status !== "IDLE" || courier.is_active === false) return false;
    const pendingOrders = await Order.findAll({
      where: { status: "LOOKING_FOR_DRIVER" },
      include: [{ model: User, as: "user" }],
      order: [["created_at", "ASC"]],
      limit,
    });
    if (!pendingOrders.length) return false;

    for (const order of pendingOrders) {
      await this.offerOrderToCourier(order, courier);
    }
    return true;
  },
  // CARI DRIVER
  async findDriverForOrder(orderId) {
    console.log(`🔍 Dispatching Order #${orderId}...`);

    // Include User untuk mendapatkan koordinat Latitude/Longitude terakhir
    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: "user" }],
    });

    if (!order) {
      console.log("Order tidak ditemukan saat dispatch.");
      return;
    }

    // Cek Redis
    let onlineCourierIds = await redisClient.sMembers("online_couriers");

    // Fallback jika Redis kosong -> ambil dari DB
    if (onlineCourierIds.length === 0) {
      const fallbackCouriers = await Courier.findAll({
        where: {
          status: "IDLE",
          is_active: true,
          current_latitude: { [Op.ne]: null },
          current_longitude: { [Op.ne]: null },
        },
        order: [["last_job_time", "ASC"]],
        limit: 5,
      });

      if (!fallbackCouriers.length) {
        console.log("TIDAK ADA KURIR ONLINE.");
        return;
      }

      onlineCourierIds = fallbackCouriers.map((c) => String(c.id));
      await redisClient.sAdd("online_couriers", onlineCourierIds);
    }

    // Filter DB (Status IDLE)
    const candidate = await Courier.findOne({
      where: {
        id: { [Op.in]: onlineCourierIds },
        status: "IDLE",
        is_active: true,
      },
      order: [["last_job_time", "ASC"]],
    });

    if (!candidate) {
      console.log(`Ada ${onlineCourierIds.length} Kurir Online, tapi SEMUA SIBUK.`);
      return;
    }

    // Tawarkan Order
    await this.offerOrderToCourier(order, candidate);
  },

  // KIRIM PENAWARAN (BROADCAST DENGAN MAPS)
  async offerOrderToCourier(order, courier) {
    try {
      const items = order.items_summary || [];
      const itemsList = items.map((i) => `- ${i.item} (x${i.qty})`).join("\n");
      const displayId = order.short_code || order.order_id;

      // GENERATE MAPS LINK
      // Mengambil koordinat dari User yang terhubung dengan Order
      let mapsLink = "";
      if (order.user && order.user.latitude && order.user.longitude) {
        // Format Link Universal Google Maps
        mapsLink = `https://www.google.com/maps/search/?api=1&query=${order.user.latitude},${order.user.longitude}`;
      } else {
        mapsLink =
          "_Koordinat tidak tersedia, harap tanya/kontak pelanggan secara langsung melalui chat_";
      }

      const message =
        `🔔 *ORDER BARU MASUK!* 🔔\n\n` +
        `🆔 *Order ID:* ${displayId}\n\n` +
        `📦 *Item:*\n${itemsList}\n\n` +
        `📍 *Ambil:* ${order.pickup_address}\n` +
        `🏁 *Antar:* ${order.delivery_address} (*Link Maps:* ${mapsLink}\n\n` +
        `👉 Balas *#AMBIL ${displayId}* untuk menerima order ini sekarang!\n` +
        `⏳ _Note: Respon cepat sebelum diambil kurir lain!_`;

      await messageService.sendMessage(courier.phone, message);

      console.log(`Offer sent to ${courier.name} with Maps Link`);
      return true;
    } catch (error) {
      console.error("Failed to offer order:", error);
      return false;
    }
  },
};
