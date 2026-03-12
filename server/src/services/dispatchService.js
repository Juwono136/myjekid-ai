import { Op } from "sequelize";
import { Courier, Order, User } from "../models/index.js";
import { messageService } from "./messageService.js";
import { redisClient } from "../config/redisClient.js";
import { BASE_CAMP_LAT, BASE_CAMP_LNG, BASE_CAMP_RADIUS_KM } from "../config/baseCamp.js";

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

const NO_COURIER_MESSAGE =
  "Pesanan kamu sudah kami catat. Saat ini belum ada kurir yang tersedia. Kami akan carikan kurir begitu ada yang siap. Mohon ditunggu ya kak. 🙏";

async function notifyCustomerNoCourier(order) {
  const orderId = order.order_id;
  const customerPhone = order.user_phone || order.user?.phone;
  if (!orderId || !customerPhone || !String(customerPhone).trim().startsWith("62")) return;
  try {
    const key = `no_courier_notified:${orderId}`;
    const alreadySent = await redisClient.get(key);
    if (alreadySent) return;

    await messageService.sendMessage(customerPhone, NO_COURIER_MESSAGE);
    await redisClient.setEx(key, NO_COURIER_NOTIFIED_TTL_SEC, "1");
  } catch (err) {
    console.error("Failed to send NO_COURIER to customer:", err);
  }
}

const testModeEnabled =
  process.env.NODE_ENV !== "production" || process.env.ENABLE_WHATSAPP_TEST_MODE === "true";

/** Mulai dan akhir hari (WIB) untuk hitung order kurir hari ini. */
function getTodayStartEnd() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Ambil kurir IDLE untuk order — pembagian merata dan dalam radius base camp.
 * - Hanya kurir dalam radius BASE_CAMP_RADIUS_KM (titik kumpul) yang diprioritaskan; di luar radius hanya jika tidak ada.
 * - Urutan penawaran: (1) test mode, (2) kurir dalam radius (urut: paling sedikit order hari ini, lalu terdekat), (3) kurir tanpa koordinat.
 * - Sort by _orderCount dulu agar kurir yang belum dapat order hari ini dapat prioritas (pembagian merata).
 * Hanya kurir yang belum pernah ditawari order ini (tidak dalam offered_courier_ids).
 */
async function getEligibleCouriersForOrder(order) {
  const offeredIds = (Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : []).map(String);

  let onlineIds = await redisClient.sMembers("online_couriers");
  if (onlineIds.length === 0) {
    const fallback = await Courier.findAll({
      where: { status: "IDLE", is_active: true },
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
    },
    attributes: ["id", "name", "phone", "current_latitude", "current_longitude", "shift_code", "last_active_at"],
  });

  const list = couriers.filter((c) => !offeredIds.includes(String(c.id)));
  if (list.length === 0) return [];

  const { start: todayStart, end: todayEnd } = getTodayStartEnd();
  const orderCounts = await Order.findAll({
    where: {
      courier_id: { [Op.in]: list.map((c) => c.id) },
      status: { [Op.notIn]: ["CANCELLED"] },
      [Op.or]: [
        { taken_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
        { created_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
      ],
    },
    attributes: ["courier_id"],
    raw: true,
  });
  const countByCourier = {};
  for (const r of orderCounts) {
    if (r.courier_id) countByCourier[r.courier_id] = (countByCourier[r.courier_id] || 0) + 1;
  }

  const testModeCouriers = [];
  const withCoord = [];
  const withoutCoord = [];

  for (const c of list) {
    const orderCountToday = countByCourier[c.id] || 0;
    const inTestMode =
      testModeEnabled && (await redisClient.get(`test_mode:${c.phone}`)) === "COURIER";
    if (inTestMode) {
      testModeCouriers.push({ ...c.toJSON(), _dist: 0, _orderCount: orderCountToday });
      continue;
    }
    const d = distanceKm(BASE_CAMP_LAT, BASE_CAMP_LNG, c.current_latitude, c.current_longitude);
    if (d <= BASE_CAMP_RADIUS_KM) withCoord.push({ ...c.toJSON(), _dist: d, _orderCount: orderCountToday });
    else if (c.current_latitude == null || c.current_longitude == null)
      withoutCoord.push({ ...c.toJSON(), _dist: Infinity, _orderCount: orderCountToday });
  }

  const sortByFair = (a, b) => (a._orderCount !== b._orderCount ? a._orderCount - b._orderCount : a._dist - b._dist);
  testModeCouriers.sort(sortByFair);
  withCoord.sort(sortByFair);
  withoutCoord.sort(sortByFair);
  return [...testModeCouriers, ...withCoord, ...withoutCoord];
}

/**
 * Ambil kurir eligible dari DB (status IDLE, is_active). Termasuk kurir yang baru selesai order (current_order_id sudah null).
 * Untuk Order Monitor dropdown (forAdminAssign: true) = semua kurir IDLE. Untuk dispatch otomatis = filter shift + belum ditawari.
 */
async function getEligibleCouriersForOrderFromDb(order, options = {}) {
  const { forAdminAssign = false } = options;
  const offeredIds = (Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : []).map(String);
  const currentShift = getCurrentShiftCode();

  const where = {
    status: "IDLE",
    is_active: true,
  };
  if (!forAdminAssign) {
    where.shift_code = currentShift;
  }

  const couriers = await Courier.findAll({
    where,
    attributes: ["id", "name", "phone", "current_latitude", "current_longitude", "shift_code"],
  });

  // Untuk admin assign: tampilkan semua kurir IDLE; untuk dispatch otomatis: hanya yang belum pernah ditawari
  const list = forAdminAssign ? [...couriers] : couriers.filter((c) => !offeredIds.includes(String(c.id)));
  const { start: todayStart, end: todayEnd } = getTodayStartEnd();
  const orderCounts = await Order.findAll({
    where: {
      courier_id: { [Op.in]: list.map((c) => c.id) },
      status: { [Op.notIn]: ["CANCELLED"] },
      [Op.or]: [
        { taken_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
        { created_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
      ],
    },
    attributes: ["courier_id"],
    raw: true,
  });
  const countByCourier = {};
  for (const r of orderCounts) {
    if (r.courier_id) countByCourier[r.courier_id] = (countByCourier[r.courier_id] || 0) + 1;
  }
  list.sort((a, b) => (countByCourier[a.id] || 0) - (countByCourier[b.id] || 0));
  return list;
}

/** Untuk halaman Order Monitor: daftar kurir eligible untuk order tertentu. */
async function getEligibleCouriersForOrderPublic(orderId) {
  const order = await Order.findOne({
    where: { order_id: orderId },
    attributes: ["offered_courier_ids", "last_offered_at"],
  });
  if (!order) return [];
  return getEligibleCouriersForOrderFromDb(order, { forAdminAssign: true });
}

export const dispatchService = {
  getCurrentShiftCode,
  getEligibleCouriersForOrder: getEligibleCouriersForOrderPublic,

  /**
   * @param {object} courier - instance Courier
   * @param {number} [limit=3] - max order yang ditawarkan
   * @param {{ forceOfferToThisCourier?: boolean }} [options] - forceOfferToThisCourier: true = tawarkan ke kurir ini langsung (mis. admin set IDLE), abaikan shift/prioritas
   */
  async offerPendingOrdersToCourier(courier, limit = 3, options = {}) {
    if (!courier || courier.is_active === false) return false;
    const { forceOfferToThisCourier = false } = options;
    if (!forceOfferToThisCourier && (courier.status !== "IDLE" || courier.shift_code !== getCurrentShiftCode())) {
      return false;
    }
    if (forceOfferToThisCourier && courier.status !== "IDLE") return false;

    const pendingOrders = await Order.findAll({
      where: { status: "LOOKING_FOR_DRIVER" },
      include: [{ model: User, as: "user", attributes: ["phone", "name"] }],
      order: [["created_at", "ASC"]],
      limit,
      attributes: [
        "order_id",
        "short_code",
        "user_phone",
        "chat_messages",
        "offered_courier_ids",
        "last_offered_at",
        "status",
      ],
    });
    if (!pendingOrders.length) return false;

    let offered = 0;
    for (const order of pendingOrders) {
      if (forceOfferToThisCourier) {
        await this.offerOrderToCourier(order, courier);
        const offeredIds = Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : [];
        if (!offeredIds.includes(courier.id)) {
          await order.update({
            offered_courier_ids: [...offeredIds, courier.id],
            last_offered_at: new Date(),
          });
        }
        offered++;
      } else {
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
    }
    return offered > 0;
  },

  async findDriverForOrder(orderId) {
    console.log(`🔍 Dispatching Order #${orderId}...`);

    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: "user", attributes: ["phone", "name"] }],
      attributes: [
        "order_id",
        "short_code",
        "user_phone",
        "chat_messages",
        "offered_courier_ids",
        "last_offered_at",
      ],
    });

    if (!order) {
      console.log("Order tidak ditemukan saat dispatch.");
      return;
    }

    const lastOffered = order.last_offered_at ? new Date(order.last_offered_at).getTime() : 0;
    const now = Date.now();
    if (lastOffered && now - lastOffered < OFFER_TIMEOUT_MS) {
      console.log(`Order #${orderId} menunggu respons kurir (short_code) — ${Math.ceil((OFFER_TIMEOUT_MS - (now - lastOffered)) / 1000)}s lagi.`);
      return;
    }

    const eligible = await getEligibleCouriersForOrder(order);
    if (eligible.length === 0) {
      const offeredIds = (Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : []).map(String);
      const anyIdle = await Courier.count({
        where: { status: "IDLE", is_active: true, shift_code: getCurrentShiftCode() },
      });
      if (anyIdle === 0 || offeredIds.length === 0) {
        await notifyCustomerNoCourier(order);
        console.log("Tidak ada kurir idle untuk order ini; notifikasi no-courier ke pelanggan.");
      } else {
        console.log("Semua kurir idle sudah dapat penawaran order ini; menunggu respon kurir.");
      }
      return;
    }

    const offeredIds = (Array.isArray(order.offered_courier_ids) ? order.offered_courier_ids : []).map(String);
    const sentIds = [];
    for (const courier of eligible) {
      const ok = await this.offerOrderToCourier(order, courier);
      if (ok) sentIds.push(courier.id);
    }
    if (sentIds.length > 0) {
      await order.update({
        offered_courier_ids: [...offeredIds, ...sentIds],
        last_offered_at: new Date(),
      });
      console.log(`Offer (short_code ${order.short_code}) — 1 pesan per kurir ke ${sentIds.length} kurir.`);
    }
  },

  async offerOrderToCourier(order, courier) {
    try {
      const code = order.short_code || order.order_id;
      const allChatMessages =
        Array.isArray(order.chat_messages) && order.chat_messages.length > 0
          ? order.chat_messages
          : [];
      const chatLines = allChatMessages
        .map((msg) => (typeof msg === "string" ? msg : msg?.body ?? String(msg)).trim())
        .filter(Boolean);
      const chatBlock =
        chatLines.length > 0
          ? "\n\n📋 *Pesan chat pelanggan saat order:*\n\n" + chatLines.join("\n\n")
          : "";

      const oneMessage =
        `🔔 *ORDER BARU MASUK!* 🔔\n\n` +
        `🆔 *Order ID:* ${order.order_id}\n\n` +
        `👉 Ketik kode *${code}* untuk ambil order ini.\n` +
        `⏳ Mohon respon segera dalam 3 menit.` +
        chatBlock;

      await messageService.sendMessage(courier.phone, oneMessage);
      console.log(`Offer (short_code ${code}) — 1 pesan ke ${courier.name}`);
      return true;
    } catch (error) {
      console.error("Failed to offer order:", error);
      return false;
    }
  },
};
