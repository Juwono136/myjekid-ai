import { Courier, Order } from "../models/index.js";
import { messageService } from "./messageService.js";
import { redisClient } from "../config/redisClient.js"; // Pastikan import redis
import { Op } from "sequelize";

export const dispatchService = {
  // Fungsi Utama: Cari Driver untuk Order Tertentu
  async findDriverForOrder(orderId) {
    console.log(`🔍 Dispatching Order #${orderId}...`);

    // 1. Ambil Data Order
    const order = await Order.findByPk(orderId);
    if (!order) {
      console.error("❌ Order not found during dispatch");
      return;
    }

    // 2. CEK KURIR ONLINE VIA REDIS (Real-time Check)
    // Kita ambil semua ID kurir yang ada di set 'online_couriers'
    const onlineCourierIds = await redisClient.sMembers("online_couriers");

    if (onlineCourierIds.length === 0) {
      console.log("⚠️ TIDAK ADA KURIR ONLINE (Redis Empty).");
      return; // Tidak ada yang ditawari
    }

    // 3. FILTER & SORTING (Database)
    // Cari detail kurir yang ID-nya ada di Redis DAN statusnya IDLE
    const candidate = await Courier.findOne({
      where: {
        id: { [Op.in]: onlineCourierIds }, // Hanya yang online
        status: "IDLE", // Hanya yang nganggur
        is_active: true,
      },
      order: [["last_active_at", "ASC"]], // Prioritas yang paling lama nunggu
    });

    if (!candidate) {
      console.log("⚠️ Kurir Online Ada, tapi SEMUA SIBUK (BUSY).");
      return;
    }

    console.log(`✅ Kandidat Kurir Ditemukan: ${candidate.name} (${candidate.phone})`);

    // 4. Tawarkan Order ke Kurir Terpilih
    await this.offerOrderToCourier(order, candidate);
  },

  // Fungsi Penawaran
  async offerOrderToCourier(order, courier) {
    try {
      // Format Pesan Penawaran yang Menarik
      // Handle items_summary agar aman jika null
      const items = order.items_summary || [];
      const itemsList = items.map((i) => `- ${i.item} (x${i.qty})`).join("\n");

      // Kita gunakan ID yang user-friendly (order_id atau id)
      const displayId = order.order_id;

      const message =
        `🔔 *ORDER BARU MASUK!* 🔔\n\n` +
        `🆔 Order ID: *${displayId}*\n` +
        `🎯 Nama Pelanggan: *${order.name}*\n` +
        `📦 Item:\n${itemsList}\n\n` +
        `📍 Ambil: ${order.pickup_address}\n` +
        `🏁 Antar: ${order.delivery_address}\n\n` +
        `👉 Balas *#AMBIL ${displayId}* untuk menerima order ini sekarang!\n` +
        `⏳ _Note: Respon cepat sebelum diambil kurir lain!_`;

      // Kirim WA via Service
      const sent = await messageService.sendMessage(courier.phone, message);

      if (sent) {
        console.log(`✅ Penawaran sukses terkirim ke ${courier.name}`);

        // Update Waktu Aktif Kurir (Rotasi Antrian)
        await courier.update({ last_active_at: new Date() });
      } else {
        console.error(`❌ Gagal mengirim WA ke ${courier.name} (Cek koneksi/nomor)`);
      }
    } catch (err) {
      console.error("❌ Error offering order:", err);
    }
  },
};
