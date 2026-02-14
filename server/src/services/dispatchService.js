import { Op } from "sequelize";
import { Courier, Order, User } from "../models/index.js";
import { messageService } from "./messageService.js";
import { redisClient } from "../config/redisClient.js";
import { aiService } from "./ai/AIService.js";

const OFFER_TIMEOUT_MS = 3 * 60 * 1000; // 3 menit

/** Shift aktif berdasarkan jam server: Shift 1 (Pagi) 06:00–13:59, Shift 2 (Sore) 14:00–21:59. */
function getCurrentShiftCode() {
  const hour = new Date().getHours();
  if (hour >= 14 && hour <= 21) return 2;
  return 1; // 6–13 dan diluar 14–21 pakai shift 1
}

/** Jarak aproksimasi (km) antara dua titik — Haversine. */
function distanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const NO_COURIER_NOTIFIED_TTL_SEC = 86400; // 24 jam

async function notifyCustomerNoCourier(order) {
  const orderId = order.order_id;
  const customerPhone = order.user_phone || order.user?.phone;
  if (!orderId || !customerPhone) return;
  try {
    const key = `no_courier_notified:${orderId}`;
    const alreadySent = await redisClient.get(key);
    if (alreadySent) return;

    const userName = order.user?.name || "Customer";
    const reply = await aiService.generateReply({
      role: "CUSTOMER",
      status: "NO_COURIER_AVAILABLE",
      context: {
        role: "CUSTOMER",
        user_name: userName,
        last_message: "",
      },
    });
    const text = typeof reply === "string" ? reply : reply?.reply;
    if (text) {
      await messageService.sendMessage(customerPhone, text);
      await redisClient.setEx(key, NO_COURIER_NOTIFIED_TTL_SEC, "1");
    }
  } catch (err) {
    console.error("Failed to send NO_COURIER_AVAILABLE to customer:", err);
  }
}

/**
 * Ambil kurir IDLE yang match shift saat ini, punya koordinat, belum pernah ditawari (atau sudah lewat timeout).
 * Diurutkan berdasarkan jarak ke lokasi pickup order (terdekat dulu).
 */
async function getEligibleCouriersForOrder(order) {
  const pickupLat = order.pickup_latitude ?? null;
  const pickupLng = order.pickup_longitude ?? null;
  const offeredIds = Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : [];
  const lastOffered = order.last_offered_at ? new Date(order.last_offered_at).getTime() : 0;
  const now = Date.now();
  const canReOffer = now - lastOffered >= OFFER_TIMEOUT_MS;

  let onlineIds = await redisClient.sMembers("online_couriers");
  if (onlineIds.length === 0) {
    const fallback = await Courier.findAll({
      where: {
        status: "IDLE",
        is_active: true,
        current_latitude: { [Op.ne]: null },
        current_longitude: { [Op.ne]: null },
      },
      attributes: ["id"],
      limit: 50,
    });
    onlineIds = fallback.map((c) => String(c.id));
    if (onlineIds.length) await redisClient.sAdd("online_couriers", onlineIds);
  }

  const currentShift = getCurrentShiftCode();
  const couriers = await Courier.findAll({
    where: {
      id: { [Op.in]: onlineIds },
      status: "IDLE",
      is_active: true,
      shift_code: currentShift,
      current_latitude: { [Op.ne]: null },
      current_longitude: { [Op.ne]: null },
    },
    attributes: ["id", "name", "phone", "current_latitude", "current_longitude", "shift_code"],
  });

  const excluded = canReOffer ? [] : offeredIds.map(String);
  const list = couriers.filter((c) => !excluded.includes(String(c.id)));

  if (pickupLat != null && pickupLng != null) {
    list.sort((a, b) => {
      const dA = distanceKm(pickupLat, pickupLng, a.current_latitude, a.current_longitude);
      const dB = distanceKm(pickupLat, pickupLng, b.current_latitude, b.current_longitude);
      return dA - dB;
    });
  }

  return list;
}

/**
 * Ambil kurir eligible dari DB saja (tanpa Redis). Untuk Order Monitor dropdown agar daftar
 * selalu sesuai kondisi terbaru di DB (idle + punya koordinat). Jika forAdminAssign=true
 * tidak filter shift agar admin tetap bisa assign kurir idle (urut tetap terdekat pickup).
 */
async function getEligibleCouriersForOrderFromDb(order, options = {}) {
  const { forAdminAssign = false } = options;
  const pickupLat = order.pickup_latitude ?? null;
  const pickupLng = order.pickup_longitude ?? null;
  const offeredIds = Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : [];
  const lastOffered = order.last_offered_at ? new Date(order.last_offered_at).getTime() : 0;
  const now = Date.now();
  const canReOffer = now - lastOffered >= OFFER_TIMEOUT_MS;
  const excluded = canReOffer ? [] : offeredIds.map(String);
  const currentShift = getCurrentShiftCode();

  const where = {
    status: "IDLE",
    is_active: true,
    current_latitude: { [Op.ne]: null },
    current_longitude: { [Op.ne]: null },
  };
  if (!forAdminAssign) {
    where.shift_code = currentShift;
  }

  const couriers = await Courier.findAll({
    where,
    attributes: ["id", "name", "phone", "current_latitude", "current_longitude", "shift_code"],
  });

  const list = couriers.filter((c) => !excluded.includes(String(c.id)));

  if (pickupLat != null && pickupLng != null) {
    list.sort((a, b) => {
      const dA = distanceKm(pickupLat, pickupLng, a.current_latitude, a.current_longitude);
      const dB = distanceKm(pickupLat, pickupLng, b.current_latitude, b.current_longitude);
      return dA - dB;
    });
  }

  return list;
}

/** Untuk halaman Order Monitor: daftar kurir eligible (idle, terdekat ke pickup) untuk order tertentu. */
async function getEligibleCouriersForOrderPublic(orderId) {
  const order = await Order.findOne({
    where: { order_id: orderId },
    attributes: ["pickup_latitude", "pickup_longitude", "offered_courier_ids", "last_offered_at"],
  });
  if (!order) return [];
  return getEligibleCouriersForOrderFromDb(order, { forAdminAssign: true });
}

export const dispatchService = {
  getCurrentShiftCode,
  getEligibleCouriersForOrder: getEligibleCouriersForOrderPublic,

  async offerPendingOrdersToCourier(courier, limit = 3) {
    if (!courier || courier.status !== "IDLE" || courier.is_active === false) return false;
    const currentShift = getCurrentShiftCode();
    if (courier.shift_code !== currentShift) return false;

    const pendingOrders = await Order.findAll({
      where: {
        status: "LOOKING_FOR_DRIVER",
        pickup_latitude: { [Op.ne]: null },
        pickup_longitude: { [Op.ne]: null },
      },
      include: [{ model: User, as: "user", attributes: ["phone", "name", "latitude", "longitude"] }],
      order: [["created_at", "ASC"]],
      limit,
      attributes: [
        "order_id",
        "short_code",
        "user_phone",
        "items_summary",
        "pickup_address",
        "delivery_address",
        "pickup_latitude",
        "pickup_longitude",
        "offered_courier_ids",
        "last_offered_at",
        "status",
      ],
    });
    if (!pendingOrders.length) return false;

    let offered = 0;
    for (const order of pendingOrders) {
      const eligible = await getEligibleCouriersForOrder(order);
      const firstId = eligible.length ? String(eligible[0].id) : null;
      if (firstId === String(courier.id)) {
        await this.offerOrderToCourier(order, courier);
        const offeredIds = Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : [];
        await order.update({
          offered_courier_ids: [...offeredIds, courier.id],
          last_offered_at: new Date(),
        });
        offered++;
      }
    }
    return offered > 0;
  },

  async findDriverForOrder(orderId) {
    console.log(`🔍 Dispatching Order #${orderId}...`);

    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: "user", attributes: ["phone", "name", "latitude", "longitude"] }],
      attributes: [
        "order_id",
        "short_code",
        "user_phone",
        "items_summary",
        "pickup_address",
        "delivery_address",
        "pickup_latitude",
        "pickup_longitude",
        "offered_courier_ids",
        "last_offered_at",
      ],
    });

    if (!order) {
      console.log("Order tidak ditemukan saat dispatch.");
      return;
    }

    const pickupLat = order.pickup_latitude ?? null;
    const pickupLng = order.pickup_longitude ?? null;
    if (pickupLat == null || pickupLng == null) {
      console.log("Order belum punya koordinat pickup; dispatch ditunda.");
      await notifyCustomerNoCourier(order);
      return;
    }

    const lastOffered = order.last_offered_at ? new Date(order.last_offered_at).getTime() : 0;
    const now = Date.now();
    if (lastOffered && now - lastOffered < OFFER_TIMEOUT_MS) {
      console.log(`Order #${orderId} menunggu respons kurir (${Math.ceil((OFFER_TIMEOUT_MS - (now - lastOffered)) / 1000)}s lagi).`);
      return;
    }

    const eligible = await getEligibleCouriersForOrder(order);
    const offeredIds = Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : [];
    const nextCourier = eligible.find((c) => !offeredIds.map(String).includes(String(c.id)));
    if (!nextCourier) {
      console.log("Tidak ada kurir idle (shift + jarak) yang tersisa untuk order ini.");
      await notifyCustomerNoCourier(order);
      return;
    }

    await this.offerOrderToCourier(order, nextCourier);
    await order.update({
      offered_courier_ids: [...offeredIds, nextCourier.id],
      last_offered_at: new Date(),
    });
    console.log(`Offer dikirim ke kurir terpilih: ${nextCourier.name} (jarak terdekat ke pickup, shift ${getCurrentShiftCode()}).`);
  },

  async offerOrderToCourier(order, courier) {
    try {
      const items = Array.isArray(order.items_summary) ? order.items_summary : [];
      const itemsList = items.map((i) => `- ${i.item} (x${i.qty})`).join("\n");
      const displayId = order.short_code || order.order_id;

      let mapsLink = "";
      if (order.user?.latitude != null && order.user?.longitude != null) {
        mapsLink = `https://www.google.com/maps/search/?api=1&query=${order.user.latitude},${order.user.longitude}`;
      } else {
        mapsLink = "_Koordinat tidak tersedia, harap tanya/kontak pelanggan melalui chat_";
      }

      const message =
        `🔔 *ORDER BARU MASUK!* 🔔\n\n` +
        `🆔 *Order ID:* ${order.order_id}\n\n` +
        `📦 *Item:*\n${itemsList}\n\n` +
        `📍 *Ambil:* ${order.pickup_address || "-"}\n` +
        `🏁 *Antar:* ${order.delivery_address || "-"} (*Link Maps:* ${mapsLink})\n\n` +
        `👉 Balas *#AMBIL ${displayId}* untuk menerima order ini sekarang!\n` +
        `⏳ _Note: Kamu hanya punya waktu 3 menit untuk respon orderan ini. Respon cepat sebelum diambil kurir lain!_`;

      await messageService.sendMessage(courier.phone, message);
      console.log(`Offer sent to ${courier.name} (shift ${courier.shift_code})`);
      return true;
    } catch (error) {
      console.error("Failed to offer order:", error);
      return false;
    }
  },
};
