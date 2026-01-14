import { Op } from "sequelize";
import { Courier, Order, User } from "../models/index.js";
import { messageService } from "./messageService.js";
import { redisClient } from "../config/redisClient.js";

export const dispatchService = {
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
    const onlineCourierIds = await redisClient.sMembers("online_couriers");
    if (onlineCourierIds.length === 0) {
      console.log("TIDAK ADA KURIR ONLINE.");
      return;
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
      const displayId = order.order_id;

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
        `🆔 *Order ID:*\n` +
        `${displayId}\n\n` +
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
