import { Op } from "sequelize";
import { User, ChatSession, Order, Courier, sequelize } from "../../models/index.js";
import { aiService } from "../ai/AIService.js";
import { sanitizePhoneNumber } from "../../utils/formatter.js";
import { orderService } from "../orderService.js";
import { redisClient } from "../../config/redisClient.js";
import { dispatchService } from "../dispatchService.js";
import { messageService } from "../messageService.js";

// Helper sapaan
const sapa = (name) => (name === "Customer" || !name ? "kak" : `kak ${name}`);

const isAffirmative = (text) => {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;

  const directSet = new Set([
    "ya",
    "y",
    "iya",
    "ok",
    "oke",
    "sip",
    "siap",
    "gas",
    "lanjut",
    "setuju",
    "boleh",
    "yes",
    "ys",
  ]);
  if (directSet.has(normalized)) return true;

  const confirmPatterns = [
    /^ya( udah| sudah)?( sesuai| benar| pas)?$/,
    /^iya( udah| sudah)?( sesuai| benar| pas)?$/,
    /^ok( udah| sudah)?( sesuai| benar| pas)?$/,
    /^oke( udah| sudah)?( sesuai| benar| pas)?$/,
    /^sip( udah| sudah)?( sesuai| benar| pas)?$/,
    /^siap( udah| sudah)?( sesuai| benar| pas)?$/,
    /^ya(,)?( masih)? sama.*$/,
    /^iya(,)?( masih)? sama.*$/,
    /^y(,)?( masih)? sama.*$/,
    /^(ok|oke|sip|siap)(,)? (sudah )?sesuai$/,
    /^(ok|oke|sip|siap)(,)? (udah|sudah) sesuai$/,
    /^(ok|oke|sip|siap)(,)? (udah|sudah) benar$/,
    /^(ok|oke|sip|mantap)(,)?( sudah)? sesuai$/,
    /^(ok|oke|sip|mantap)(,)?( sudah)? benar$/,
    /^(ok|oke|sip|mantap)(,)?( ya)?$/,
    /^(ok|oke|sip|mantap)(,)? (sip|mantap)$/,
    /^sudah(,)? (sesuai|benar)?$/,
    /^udah(,)? (sesuai|benar)?$/,
    /^sudah,? (thanks|makasih|terima kasih)$/,
    /^gak ada(,)?( itu aja)?( dulu)?$/,
    /^tidak ada(,)?( itu aja)?( dulu)?$/,
    /^itu aja(,)?( dulu)?$/,
  ];

  if (confirmPatterns.some((pattern) => pattern.test(normalized))) return true;

  const confirmTokens = new Set(["ya", "iya", "ok", "oke", "sip", "siap", "mantap", "setuju", "lanjut"]);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.length <= 3) {
    const allConfirmish = tokens.every((token) => confirmTokens.has(token));
    if (allConfirmish) return true;
  }

  return false;
};

const isConfirmingText = (text) =>
  isAffirmative(text) ||
  /(sudah|sesuai|benar|mantap|sip|terima kasih|makasih|thanks)/.test(text);

// Gunakan word boundary agar "ga" di dalam kata (misal "gorengannya") tidak dianggap negatif
const isNegative = (text) => {
  const lower = text.toLowerCase().trim();
  return (
    /\b(tidak|gak|ga|nggak|batal|gajadi|bukan|gk)\b/.test(lower) ||
    /\b(ga|nggak)\s+jadi\b/.test(lower)
  );
};

const isPolite = (text) =>
  ["makasih", "terima kasih", "thanks", "thank", "oke", "ok", "sip", "mantap", "siap", "baik"].some((w) =>
    text.includes(w),
  );

const isGreeting = (text) =>
  /^(pagi|siang|sore|malam|halo|hai|hei|helo|hello|assalamualaikum|wr\s*wb|salam)\b/i.test(text.trim()) ||
  /\b(pagi|siang|sore|malam)\s*(kak|ya|)?\s*$/i.test(text.trim()) ||
  /^(halo|hai|hei)\s*(kak|)?\s*$/i.test(text.trim());

const isIntroToOrder = (text) =>
  /mau\s*(pesan|pesen|order)/i.test(text) ||
  /(pesen|order)\s*dong/i.test(text) ||
  /(mau\s*)?(titip|nitip)/i.test(text) ||
  /pesan\s*(dong|ya|dong)/i.test(text);

const isPhotoNoteRequest = (text) =>
  ["fotoin", "foto", "photo", "bukti serah", "bukti terima", "salah terima"].some((w) =>
    text.includes(w),
  );

const isAddOnRequest = (text) =>
  ["titip", "nitip", "sekalian", "tambahan", "tambah", "nambah"].some((w) =>
    text.includes(w),
  );

const normalizeItemName = (name) =>
  (name || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const canonicalizeItemLabel = (name) => {
  const normalized = normalizeItemName(name);
  if (!normalized) return name;
  // title-case each word but preserve common lowercase particles
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const cleanPickupName = (pickup) => {
  if (!pickup) return pickup;
  const tokens = pickup.toString().trim().split(/\s+/);
  const stopTokens = new Set(["porsi", "pcs", "cup", "gelas", "bungkus", "pack"]);
  while (tokens.length) {
    const last = tokens[tokens.length - 1].toLowerCase();
    if (/^x?\d+$/.test(last) || stopTokens.has(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ").trim();
};

const parseGoogleMapsLink = (text = "") => {
  const lower = text.toLowerCase();
  if (!lower.includes("maps.google.com") && !lower.includes("google.com/maps")) {
    return null;
  }
  const qMatch = lower.match(/[?&]q=([-0-9.]+)%2c([-0-9.]+)/i);
  if (qMatch) {
    return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };
  }
  const atMatch = lower.match(/@([-0-9.]+),([-0-9.]+)/i);
  if (atMatch) {
    return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
  }
  return null;
};

/**
 * Jika pesan berisi alamat antar + instruksi titip (bilang aja/titipan/titip),
 * pisahkan jadi delivery_address dan order_notes agar sesuai kolom tabel orders.
 * Dipakai sebagai fallback bila AI mengembalikan semuanya di order_notes.
 */
const splitAddressAndTitipNote = (text) => {
  const t = (text || "").trim();
  if (!t || t.length < 10) return null;
  const lower = t.toLowerCase();
  const hasAddressHint = /antar\s+ke\s+|ke\s+ruang\s+|ruang\s+pak\s+|ruang\s+bu\s+|kantor\s+|gedung\s+|lantai\s+|alamat\s+antar/i.test(t);
  const hasTitipHint = /\bbilang\s+aja\s+|\btitipan\s+|\btitip\s+(aja\s+)?ke\s+|\bserah\s+ke\s+|\btitip\s+aja\s+/i.test(t);
  if (!hasAddressHint || !hasTitipHint) return null;

  let addressPart = "";
  let notePart = "";
  const bilangAjaMatch = t.match(/\s+(bilang\s+aja\s+[\s\S]+)/i);
  const titipanMatch = t.match(/\s+(titipan\s+[\s\S]+)/i);
  const titipKeMatch = t.match(/\s+(titip\s+ke\s+[\s\S]+)/i);

  if (bilangAjaMatch && bilangAjaMatch.index !== undefined) {
    addressPart = t.slice(0, bilangAjaMatch.index).trim();
    notePart = bilangAjaMatch[1].trim();
  } else if (titipanMatch && titipanMatch.index !== undefined) {
    addressPart = t.slice(0, titipanMatch.index).trim();
    notePart = titipanMatch[1].trim();
    if (!/^bilang\s+aja\s+/i.test(notePart)) notePart = `Bilang aja ${notePart}`;
  } else if (titipKeMatch && titipKeMatch.index !== undefined) {
    addressPart = t.slice(0, titipKeMatch.index).trim();
    notePart = titipKeMatch[1].trim();
  }
  if (!addressPart || !notePart) return null;

  const cleanAddress = addressPart
    .replace(/^antar\s+ke\s+/i, "")
    .replace(/\s*\.\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const addressNormalized = cleanAddress
    .split(/\s*\.\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const s = seg.trim();
      if (!s) return s;
      return s
        .split(/\s+/)
        .map((w) => {
          const low = w.toLowerCase();
          if (low === "ke" || low === "ya" || low === "di" || low.length <= 2) return low;
          if (/^(pak|bu|bang|mbak)\b/i.test(w)) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(" ");
    })
    .join(", ");
  const noteNormalized = notePart
    .replace(/\bdri\b/gi, "dari")
    .replace(/\s+/g, " ")
    .trim();
  const noteCapitalized =
    noteNormalized.charAt(0).toUpperCase() + noteNormalized.slice(1).toLowerCase();

  if (addressNormalized.length < 4) return null;
  return {
    delivery_address: addressNormalized,
    order_notes: [noteCapitalized],
  };
};

const isWeakAddress = (address = "") => {
  const normalized = address.toLowerCase().trim();
  if (!normalized || normalized.length < 6) return true;
  const weakPatterns = [
    "ini aja",
    "ini ini aja",
    "sini aja",
    "di sini",
    "disini",
    "alamat ini",
    "alamat ini aja",
  ];
  return weakPatterns.some((pattern) => normalized === pattern);
};

const extractPriceTokens = (text) => {
  const tokens = [];
  const regex = /(\d{1,3}(?:\.\d{3})+|\d+)\s?(rb|rbu|ribu|k|k\b|rb\b)?/gi;
  let match;
  while ((match = regex.exec(text))) {
    const rawNum = match[1]?.replace(/\./g, "");
    if (!rawNum) continue;
    const suffix = match[2]?.toLowerCase() || "";
    let value = parseInt(rawNum);
    if (suffix.includes("k") || suffix.includes("rb") || suffix.includes("rbu") || suffix.includes("ribu")) {
      if (value < 1000) value *= 1000;
    }
    if (value >= 1000) tokens.push(`Harga: Rp${value.toLocaleString("id-ID")}`);
  }
  return tokens;
};

const normalizeNote = (note) =>
  (note || "")
    .toString()
    .toLowerCase()
    .replace(/bilang aja\s+/g, "")
    .replace(/bilang\s+/g, "")
    .replace(/\bdri\b/g, "dari")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const mergeNotes = (...notes) => {
  const allNotes = notes
    .flat()
    .filter(Boolean)
    .flatMap((note) =>
      note
        .toString()
        .split(";")
        .map((chunk) => chunk.trim())
        .filter(Boolean),
    );
  const seen = new Set();
  const result = [];
  allNotes.forEach((note) => {
    const key = normalizeNote(note);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(note);
  });
  return result.join("; ");
};

const titleCase = (text) =>
  text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const inferPickupFromText = (items = [], rawText = "") => {
  const text = rawText.toLowerCase();

  const matchExplicit = text.match(/\b(?:di|dari)\s+([a-z0-9\s\-_.]+)/i);
  if (matchExplicit?.[1]) {
    const candidate = matchExplicit[1]
      .split(" ")
      .slice(0, 6)
      .join(" ")
      .trim();
    if (candidate.length > 2) {
      return titleCase(candidate);
    }
  }

  for (const item of items) {
    const itemName = normalizeItemName(item.item);
    if (!itemName) continue;
    const idx = text.indexOf(itemName);
    if (idx >= 0) {
      const tail = text.slice(idx + itemName.length).trim();
      if (!tail) continue;
      const tokens = tail.split(/\s+/);
      const stopWords = new Set([
        "ya",
        "aja",
        "saja",
        "dong",
        "nih",
        "nya",
        "porsi",
        "bungkus",
        "paket",
        "sama",
        "dan",
        "plus",
      ]);
      const vendorTokens = [];
      for (const token of tokens) {
        if (!token || stopWords.has(token)) break;
        if (/^\d+$/.test(token)) break;
        vendorTokens.push(token);
      }
      if (vendorTokens.length) {
        return titleCase(`${itemName} ${vendorTokens.join(" ")}`.trim());
      }
    }
  }

  return null;
};

const extractOrderNote = (rawText = "") => {
  const text = rawText.toLowerCase();
  if (text.includes("bilang")) {
    return rawText.slice(rawText.toLowerCase().indexOf("bilang")).trim();
  }
  if (text.includes("titip") || text.includes("titipan")) {
    const idx = text.includes("titip") ? text.indexOf("titip") : text.indexOf("titipan");
    return rawText.slice(idx).trim();
  }
  if (text.includes("kasih tau") || text.includes("kasih tahu")) {
    const idx = text.includes("kasih tau") ? text.indexOf("kasih tau") : text.indexOf("kasih tahu");
    return rawText.slice(idx).trim();
  }
  if (text.includes("kasih pesenan") || text.includes("kasih pesenannya")) {
    const idx = text.includes("kasih pesenan") ? text.indexOf("kasih pesenan") : text.indexOf("kasih pesenannya");
    return rawText.slice(idx).trim();
  }
  if (text.includes("serahkan") || text.includes("serah kan")) {
    const idx = text.includes("serahkan") ? text.indexOf("serahkan") : text.indexOf("serah kan");
    return rawText.slice(idx).trim();
  }
  if (text.includes("berikan") && text.includes(" ke ")) {
    return rawText.slice(text.indexOf("berikan")).trim();
  }
  if (text.includes("suruh")) {
    return rawText.slice(text.indexOf("suruh")).trim();
  }
  if (text.includes("catatan")) {
    return rawText.slice(text.indexOf("catatan")).trim();
  }
  if (text.includes("note")) {
    return rawText.slice(text.indexOf("note")).trim();
  }
  if (text.includes("tolong") && (text.includes("kasih") || text.includes("serah") || text.includes("sampai") || text.includes(" aja ya"))) {
    return rawText.slice(text.indexOf("tolong")).trim();
  }
  return null;
};

const uniqueNotesList = (notes = []) => {
  const seen = new Set();
  return notes
    .map((n) => (typeof n === "string" ? n : n?.note))
    .filter(Boolean)
    .filter((note) => {
      const key = normalizeNote(note);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};


const isReplaceIntent = (text) => {
  const t = (text || "").trim();
  return (
    /ganti\s+.+\s+jadi|ubah\s+.+\s+jadi/i.test(t) ||
    /\bganti\s+jadi\b/i.test(t) ||
    /\bdiganti\s+jadi\b/i.test(t) ||
    /yang\s+pakai\s+.+\s+(ganti|tolong\s+ganti)\s+jadi/i.test(t) ||
    /yang\s+.+\s+diganti\s+jadi/i.test(t) ||
    /yang\s+.+\s+(tidak\s+jadi|batal)\b/i.test(t) ||
    /yang\s+.+\s+dihapus/i.test(t) ||
    /\bdihapus\s*aja\b/i.test(t) ||
    /jadinya\s+\d+\s*porsi\s*aja/i.test(t) ||
    /\d+\s*porsi\s*aja\s+jadinya/i.test(t)
  );
};

const mergeItems = (existingItems = [], incomingItems = [], rawText = "", replaceNoteForMatch = false) => {
  const result = Array.isArray(existingItems) ? [...existingItems] : [];
  const priceTokens = extractPriceTokens(rawText);
  const useReplaceNote = replaceNoteForMatch && isReplaceIntent(rawText);

  const noteHasPrice = (note) =>
    typeof note === "string" &&
    /\b(\d+\s*(rb|rbu|ribu|k)\b|rp\s*[\d.,]+)/i.test(note);

  incomingItems.forEach((incoming, idx) => {
    const normalizedLabel = canonicalizeItemLabel(incoming.item);
    const incomingItem = { ...incoming, item: normalizedLabel || incoming.item };
    const incomingName = normalizeItemName(incoming.item);
    const matchIndex = result.findIndex((item) => normalizeItemName(item.item) === incomingName);
    const priceNote =
      priceTokens[idx] && !noteHasPrice(incoming.note) ? priceTokens[idx] : "";

    if (matchIndex >= 0) {
      const prev = result[matchIndex];
      const note =
        useReplaceNote && (incoming.note || "").trim().length > 0
          ? (incoming.note || "").trim() + (priceNote ? `; ${priceNote}` : "")
          : mergeNotes(prev.note, incoming.note, priceNote);
      result[matchIndex] = {
        ...prev,
        qty: incoming.qty || prev.qty || 1,
        note: note || prev.note || "",
      };
    } else {
      const mergedNote = mergeNotes(
        incoming.note,
        noteHasPrice(incoming.note) ? "" : priceNote,
      );
      result.push({
        ...incomingItem,
        qty: incoming.qty || 1,
        note: mergedNote || "",
      });
    }
  });

  return result;
};

const removeItemsByName = (items = [], removeNames = []) => {
  if (!removeNames.length) return items;
  const removeSet = new Set(removeNames.map(normalizeItemName));
  return items.filter((item) => !removeSet.has(normalizeItemName(item.item)));
};

const appendOrderNotes = async (order, notes = []) => {
  if (!order || !notes.length) return order;
  const existing = Array.isArray(order.order_notes) ? order.order_notes : [];
  const existingKeys = new Set(
    existing
      .map((n) => (typeof n === "string" ? n : n?.note || ""))
      .map((n) => normalizeNote(n))
      .filter(Boolean),
  );
  const newNotes = notes
    .map((note) => (typeof note === "string" ? note : note?.note))
    .filter(Boolean)
    .filter((note) => {
      const key = normalizeNote(note);
      if (!key || existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    })
    .map((note) => ({ note, at: new Date().toISOString() }));
  await order.update({ order_notes: [...existing, ...newNotes] });
  return order;
};

const removeOrderNotes = async (order, removeHints = []) => {
  if (!order || !Array.isArray(order.order_notes)) return order;
  let notes = [...order.order_notes];

  if (!removeHints.length) {
    notes.pop();
  } else {
    const lowerHints = removeHints.map((n) => n.toLowerCase());
    notes = notes.filter((n) => {
      const noteText = (typeof n === "string" ? n : n?.note || "").toLowerCase();
      return !lowerHints.some((h) => noteText.includes(h));
    });
  }

  await order.update({ order_notes: notes });
  return order;
};

const notifyCourierUpdate = async (order, updateContext = {}) => {
  if (!order?.courier_id) return;
  const courier = await Courier.findByPk(order.courier_id);
  if (!courier) return;
  const reply = await aiService.generateReply({
    role: "COURIER",
    status: "ORDER_UPDATE_APPLIED",
    context: {
      role: "COURIER",
      courier_name: courier.name,
      order_status: order.status,
      order_id: order.order_id || null,
      short_code: order.short_code || null,
      items: order.items_summary || [],
      pickup: order.pickup_address || "",
      address: order.delivery_address || "",
      notes: uniqueNotesList(order.order_notes || []),
      changes: updateContext.changes || [],
      flags: { show_details: true },
      last_message: updateContext.last_message || "",
    },
    required_phrases: [
      "Halo rider, ada update pesanan order dari pelanggan nih! 😊",
      "Berikut detail ordernya saat ini:",
    ],
  });
  await messageService.sendMessage(courier.phone, reply);
};

const sendFollowupMessage = (to, text) => {
  if (!to || !text) return;
  setTimeout(() => {
    messageService.sendMessage(to, text).catch(() => null);
  }, 700);
};

const buildUserContext = ({
  user,
  draftOrder,
  activeOrder,
  items = [],
  pickup = "",
  address = "",
  notes = [],
  changes = [],
  updateItems = [],
  updateNotes = [],
  flags = {},
  lastMessage = "",
}) => {
  const order = draftOrder || activeOrder;
  return {
    role: "CUSTOMER",
    user_name: user?.name || "Customer",
    order_status: draftOrder?.status || activeOrder?.status || "NONE",
    order_id: order?.order_id || null,
    short_code: order?.short_code || null,
    items,
    pickup,
    address,
    notes: uniqueNotesList(notes),
    changes,
    update_items: updateItems,
    update_notes: updateNotes,
    flags,
    last_message: lastMessage,
  };
};

const buildUserReply = async (responseSpec) => {
  return await aiService.generateReply(responseSpec);
};

export const handleUserMessage = async (
  phone,
  name,
  text,
  rawSenderId,
  locationData = null,
  io = null,
) => {
  const cleanText = (text || "").trim();
  const lowerText = cleanText.toLowerCase();
  const LOCATION_INSTRUCTION =
    "Silahkan klik tombol *Clip (📎)* di WA -> Pilih *Location* -> *Send Your Current Location* untuk update/tambah lokasi koordinat alamat antar kamu biar kurirnya nanti tidak nyasar hehe 😅🙏.";
  const PHONE_INSTRUCTION = "Contohnya ketik: 08123456789";

  const makeReply = async (status, context, required_phrases = []) =>
    await buildUserReply({
      role: "CUSTOMER",
      status,
      context,
      required_phrases,
    });

  // SETUP USER & REGISTRASI
  let user = await User.findOne({
    where: sequelize.or({ phone }, { device_id: rawSenderId }, { phone: rawSenderId }),
  });

  if (!user) {
    const potentialPhone = sanitizePhoneNumber(cleanText);
    if (potentialPhone) {
      const existingUser = await User.findOne({ where: { phone: potentialPhone } });
      if (existingUser) {
        await existingUser.update({ device_id: rawSenderId });
        return {
          reply: await makeReply("ACCOUNT_LINKED", {
            role: "CUSTOMER",
            user_name: existingUser.name,
            phone: existingUser.phone,
            last_message: cleanText,
          }),
        };
      }
      await User.create({
        phone: potentialPhone,
        name: name || "Pelanggan",
        device_id: rawSenderId,
      });
      return {
        reply: await makeReply("REGISTERED", {
          role: "CUSTOMER",
          user_name: name || "Pelanggan",
          phone: potentialPhone,
          last_message: cleanText,
        }),
      };
    }

    return {
      reply: await makeReply(
        "ASK_PHONE",
        { role: "CUSTOMER", user_name: name || "Pelanggan", last_message: cleanText },
        [PHONE_INSTRUCTION],
      ),
    };
  }

  // SETUP SESSION & REDIS MEMORY
  const realPhone = user.phone;
  const [session] = await ChatSession.findOrCreate({
    where: { phone: realPhone },
    defaults: { mode: "BOT" },
  });

  // Blocking Jika Mode Human Aktif (Bot Diam)
  if (session.mode === "HUMAN") {
    return null;
  }

  const redisKey = `session:${realPhone}:draft`;
  const rawDraft = await redisClient.get(redisKey);
  let sessionDraft = rawDraft ? JSON.parse(rawDraft) : {};

  // LOGIC PAUSE (Untuk delay bot, beda dengan Human Mode)
  if (session.is_paused_until) {
    const now = new Date();
    if (now >= new Date(session.is_paused_until)) {
      await session.update({ is_paused_until: null });
    } else {
      return { action: "noop" };
    }
  }

  if (cleanText.startsWith("#")) {
    return {
      reply: await makeReply("UNKNOWN_COMMAND", {
        role: "CUSTOMER",
        user_name: user.name,
        last_message: cleanText,
        known_commands: ["#INFO"],
      }),
    };
  }

  // HANDLER KHUSUS LOKASI (UPDATE KOORDINAT) — step 1: lokasi antar (delivery), step 2: lokasi pickup. Pesan WAJIB sesuai jenis lokasi yang baru diterima.
  if (locationData && locationData.latitude) {
    console.log(
      `User ${name} Shared Location: ${locationData.latitude}, ${locationData.longitude}`,
    );

    const [draftOrderLoc, activeOrderLocPlaceholder] = await Promise.all([
      Order.findOne({
        where: { user_phone: realPhone, status: { [Op.in]: ["DRAFT", "PENDING_CONFIRMATION"] } },
        order: [["created_at", "DESC"]],
      }),
      Order.findOne({
        where: {
          user_phone: realPhone,
          status: { [Op.in]: ["LOOKING_FOR_DRIVER", "ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
        },
        order: [["created_at", "DESC"]],
      }),
    ]);
    let activeOrderLoc = activeOrderLocPlaceholder;
    const hasItemsLoc = Array.isArray(draftOrderLoc?.items_summary) && draftOrderLoc.items_summary.length > 0;
    const hasPickupLoc = draftOrderLoc?.pickup_address?.length > 2;
    const hasAddressLoc = draftOrderLoc?.delivery_address?.length > 3;

    // Lokasi PERTAMA = lokasi antar (tujuan pengantaran). Hanya masuk sini bila belum punya has_coordinate.
    if (!sessionDraft.has_coordinate) {
      await user.update({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
      });
      sessionDraft.has_coordinate = true;
      sessionDraft.coordinate = {
        lat: locationData.latitude,
        long: locationData.longitude,
      };
      sessionDraft.location_confirmed = false;
      sessionDraft.pending_location_confirmation = !!(draftOrderLoc && hasItemsLoc && hasPickupLoc && hasAddressLoc);
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
      const needPickupMsg =
        "Terima kasih, lokasi *alamat antar* (tujuan pengantaran) sudah kami catat ya kak 😊\n\nSekarang kirim juga *titik lokasi alamat pickup* (tempat ambil pesanan) ya — klik Clip (📎) di WA -> Pilih Location -> Send Your Current Location.";
      return { reply: needPickupMsg };
    }

    // Lokasi KEDUA = lokasi pickup (tempat ambil pesanan). Jangan ucapkan "alamat antar" di sini.
    if (!sessionDraft.has_pickup_coordinate) {
      sessionDraft.has_pickup_coordinate = true;
      sessionDraft.pickup_coordinate = {
        lat: locationData.latitude,
        long: locationData.longitude,
      };
      sessionDraft.pickup_location_confirmed = false;
      sessionDraft.pending_pickup_location_confirmation = !!(draftOrderLoc && hasItemsLoc && hasPickupLoc && hasAddressLoc);
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
      const pickupReceivedMsg =
        "Lokasi *pickup* (tempat ambil pesanan) sudah kami catat ya kak 😊\n\nBalas *OK* atau *Ya* untuk konfirmasi terakhir, nanti pesanan kami proses dan carikan kurir.";
      return { reply: pickupReceivedMsg };
    }

    sessionDraft.location_confirmed = !(draftOrderLoc && hasItemsLoc && hasPickupLoc && hasAddressLoc);
    sessionDraft.pending_location_confirmation = !!(draftOrderLoc && hasItemsLoc && hasPickupLoc && hasAddressLoc);
    await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
    const replyStatus =
      sessionDraft.pending_location_confirmation ? "LOCATION_RECEIVED_CONFIRM" : "LOCATION_RECEIVED";
    return {
      reply: await makeReply(
        replyStatus,
        buildUserContext({
          user,
          draftOrder: draftOrderLoc,
          activeOrder: activeOrderLoc,
          items: draftOrderLoc?.items_summary || activeOrderLoc?.items_summary || [],
          pickup: draftOrderLoc?.pickup_address || activeOrderLoc?.pickup_address || "",
          address: draftOrderLoc?.delivery_address || activeOrderLoc?.delivery_address || "",
          notes: uniqueNotesList(draftOrderLoc?.order_notes || activeOrderLoc?.order_notes || []),
          flags: { needs_confirmation: replyStatus === "LOCATION_RECEIVED_CONFIRM" },
          lastMessage: cleanText,
        }),
      ),
    };
  }

  // HANDLE GOOGLE MAPS LINK (TEXT) — urutan sama dengan lokasi attachment: link pertama = alamat antar, link kedua = alamat pickup
  const mapLinkLocation = parseGoogleMapsLink(cleanText);
  const mapOnly = cleanText.replace(/https?:\/\/\S+/gi, "").trim().length === 0;
  if (mapLinkLocation && mapOnly && !locationData) {
    const [draftOrderMap, activeOrderMap] = await Promise.all([
      Order.findOne({
        where: { user_phone: realPhone, status: { [Op.in]: ["DRAFT", "PENDING_CONFIRMATION"] } },
        order: [["created_at", "DESC"]],
      }),
      Order.findOne({
        where: {
          user_phone: realPhone,
          status: { [Op.in]: ["LOOKING_FOR_DRIVER", "ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
        },
        order: [["created_at", "DESC"]],
      }),
    ]);
    const hasItemsMap = Array.isArray(draftOrderMap?.items_summary) && draftOrderMap.items_summary.length > 0;
    const hasPickupMap = draftOrderMap?.pickup_address?.length > 2;
    const hasAddressMap = draftOrderMap?.delivery_address?.length > 3;
    const needsOkConfirmMap = draftOrderMap && hasItemsMap && hasPickupMap && hasAddressMap;

    if (sessionDraft.has_coordinate && !sessionDraft.has_pickup_coordinate) {
      sessionDraft.has_pickup_coordinate = true;
      sessionDraft.pickup_coordinate = {
        lat: mapLinkLocation.latitude,
        long: mapLinkLocation.longitude,
      };
      sessionDraft.pickup_location_confirmed = false;
      sessionDraft.pending_pickup_location_confirmation = needsOkConfirmMap;
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
      const pickupReceivedMsg =
        "Lokasi *pickup* (tempat ambil pesanan) sudah kami catat ya kak 😊\n\nBalas *OK* atau *Ya* untuk konfirmasi terakhir, nanti pesanan kami proses dan carikan kurir.";
      return { reply: pickupReceivedMsg };
    }

    if (!sessionDraft.has_coordinate) {
      await user.update({
        latitude: mapLinkLocation.latitude,
        longitude: mapLinkLocation.longitude,
      });
      sessionDraft.has_coordinate = true;
      sessionDraft.coordinate = {
        lat: mapLinkLocation.latitude,
        long: mapLinkLocation.longitude,
      };
      sessionDraft.location_confirmed = false;
      sessionDraft.pending_location_confirmation = needsOkConfirmMap;
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
      const needPickupMsg =
        "Terima kasih, lokasi *alamat antar* (tujuan pengantaran) sudah kami catat ya kak 😊\n\nSekarang kirim juga *titik lokasi alamat pickup* (tempat ambil pesanan) ya — klik Clip (📎) di WA -> Pilih Location -> Send Your Current Location.";
      return { reply: needPickupMsg };
    }

    sessionDraft.location_confirmed = !needsOkConfirmMap;
    sessionDraft.pending_location_confirmation = needsOkConfirmMap;
    await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

    if (draftOrderMap && hasItemsMap && hasPickupMap && hasAddressMap) {
      if (draftOrderMap.status !== "PENDING_CONFIRMATION") {
        await draftOrderMap.update({ status: "PENDING_CONFIRMATION" });
      }
    }

    return {
      reply: await makeReply(
        needsOkConfirmMap ? "LOCATION_RECEIVED_CONFIRM" : "LOCATION_RECEIVED",
        buildUserContext({
          user,
          draftOrder: draftOrderMap,
          activeOrder: activeOrderMap,
          items: draftOrderMap?.items_summary || activeOrderMap?.items_summary || [],
          pickup: draftOrderMap?.pickup_address || activeOrderMap?.pickup_address || "",
          address: draftOrderMap?.delivery_address || activeOrderMap?.delivery_address || "",
          notes: uniqueNotesList(draftOrderMap?.order_notes || activeOrderMap?.order_notes || []),
          flags: { needs_confirmation: needsOkConfirmMap },
          lastMessage: cleanText,
        }),
      ),
    };
  }

  try {
    // CONTEXT GATHERING — paralel agar respon lebih cepat
    const [draftOrder, activeOrder, lastSuccessOrder] = await Promise.all([
      Order.findOne({
        where: { user_phone: realPhone, status: { [Op.in]: ["DRAFT", "PENDING_CONFIRMATION"] } },
        order: [["created_at", "DESC"]],
      }),
      Order.findOne({
        where: {
          user_phone: realPhone,
          status: { [Op.in]: ["LOOKING_FOR_DRIVER", "ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"] },
        },
        include: [{ model: Courier, as: "courier" }],
        order: [["created_at", "DESC"]],
      }),
      Order.findOne({
        where: { user_phone: realPhone, status: "COMPLETED" },
        order: [["created_at", "DESC"]],
      }),
    ]);

    const currentStatus = draftOrder
      ? draftOrder.status
      : activeOrder
      ? activeOrder.status
      : "NONE";

    /** Update order berjalan = order sudah ON_PROCESS atau BILL_VALIDATION (bukan buat order baru). */
    const isUpdateOrderBerjalan =
      activeOrder && ["ON_PROCESS", "BILL_VALIDATION"].includes(activeOrder.status);

    // EARLY: Konfirmasi lokasi pickup (Balas OK/Ya setelah kirim lokasi pickup) — baru proses order & carikan kurir
    if (
      sessionDraft.pending_pickup_location_confirmation &&
      isConfirmingText(lowerText) &&
      draftOrder &&
      sessionDraft.has_pickup_coordinate &&
      sessionDraft.pickup_coordinate?.lat != null &&
      sessionDraft.pickup_coordinate?.long != null
    ) {
      sessionDraft.pickup_location_confirmed = true;
      sessionDraft.pending_pickup_location_confirmation = false;
      sessionDraft.location_confirmed = true;
      sessionDraft.pending_location_confirmation = false;
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

      const validItems =
        Array.isArray(draftOrder.items_summary) && draftOrder.items_summary.length > 0;
      const validPickup = draftOrder.pickup_address?.length > 2;
      const validAddress = draftOrder.delivery_address?.length > 3;
      const hasLocation =
        user.latitude != null ||
        user.longitude != null ||
        sessionDraft.has_coordinate === true ||
        (sessionDraft.coordinate && sessionDraft.coordinate.lat != null);

      if (validItems && validPickup && validAddress && hasLocation) {
        await draftOrder.update({
          status: "LOOKING_FOR_DRIVER",
          pickup_latitude: sessionDraft.pickup_coordinate.lat,
          pickup_longitude: sessionDraft.pickup_coordinate.long,
        });
        await user.update({
          address_text: draftOrder.delivery_address,
          last_order_date: new Date(),
        });
        await redisClient.del(redisKey);
        dispatchService
          .findDriverForOrder(draftOrder.order_id)
          .catch((err) => console.error("❌ Dispatch Error:", err));
        return {
          reply: await makeReply(
            "ORDER_CONFIRMED",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              address: draftOrder.delivery_address || "",
              notes: uniqueNotesList(draftOrder.order_notes || []),
              flags: { searching_driver: true },
              lastMessage: cleanText,
            }),
          ),
        };
      }
    }

    // EARLY: Saat menunggu konfirmasi lokasi antar (Balas OK/Ya) — jika belum ada lokasi pickup, minta dulu
    if (
      sessionDraft.pending_location_confirmation &&
      isConfirmingText(lowerText) &&
      draftOrder
    ) {
      sessionDraft.location_confirmed = true;
      sessionDraft.pending_location_confirmation = false;
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

      const validItems =
        Array.isArray(draftOrder.items_summary) && draftOrder.items_summary.length > 0;
      const validPickup = draftOrder.pickup_address?.length > 2;
      const validAddress = draftOrder.delivery_address?.length > 3;
      const hasLocation =
        user.latitude != null ||
        user.longitude != null ||
        sessionDraft.has_coordinate === true ||
        (sessionDraft.coordinate && sessionDraft.coordinate.lat != null);
      const hasPickupCoord =
        sessionDraft.has_pickup_coordinate &&
        sessionDraft.pickup_coordinate?.lat != null &&
        sessionDraft.pickup_coordinate?.long != null;

      if (validItems && validPickup && validAddress && hasLocation && hasPickupCoord) {
        await draftOrder.update({
          status: "LOOKING_FOR_DRIVER",
          pickup_latitude: sessionDraft.pickup_coordinate.lat,
          pickup_longitude: sessionDraft.pickup_coordinate.long,
        });
        await user.update({
          address_text: draftOrder.delivery_address,
          last_order_date: new Date(),
        });
        await redisClient.del(redisKey);
        dispatchService
          .findDriverForOrder(draftOrder.order_id)
          .catch((err) => console.error("❌ Dispatch Error:", err));
        return {
          reply: await makeReply(
            "ORDER_CONFIRMED",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              address: draftOrder.delivery_address || "",
              notes: uniqueNotesList(draftOrder.order_notes || []),
              flags: { searching_driver: true },
              lastMessage: cleanText,
            }),
          ),
        };
      }

      if (validItems && validPickup && validAddress && hasLocation && !hasPickupCoord) {
        sessionDraft.has_coordinate = true;
        if (user.latitude != null && user.longitude != null) {
          sessionDraft.coordinate = { lat: user.latitude, long: user.longitude };
        }
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply:
            "Lokasi antar sudah kami catat. Sekarang kirim juga *titik lokasi alamat pickup* (tempat ambil pesanan) ya kak — klik Clip (📎) -> Location -> Send Your Current Location.",
        };
      }

      return {
        reply: await makeReply(
          "ORDER_SUMMARY",
          buildUserContext({
            user,
            draftOrder,
            items: draftOrder.items_summary || [],
            pickup: draftOrder.pickup_address || "",
            address: draftOrder.delivery_address || "",
            notes: uniqueNotesList(draftOrder.order_notes || []),
            flags: { needs_confirmation: true },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    const combinedDraft = {
      existing_items: draftOrder?.items_summary || [],
      existing_pickup: draftOrder?.pickup_address || null,
      existing_address: draftOrder?.delivery_address || null,
      existing_notes: draftOrder?.order_notes || [],
      ...sessionDraft,
    };

    const contextData = {
      user_name: user.name,
      phone_number: realPhone,
      current_order_status: currentStatus,
      draft_data: combinedDraft,
      history_address:
        user.address_text || (lastSuccessOrder ? lastSuccessOrder.delivery_address : null),
    };

    // AI PROCESSING
    const aiResult = await aiService.parseOrder(cleanText, contextData);
    const aiData = aiResult?.data || {};
    let intent = aiResult?.intent || "";
    let finalReply = "";

    // Fallback: pisah alamat antar vs catatan titip dari teks agar sesuai kolom orders (delivery_address, order_notes)
    const addressTitipSplit = splitAddressAndTitipNote(cleanText);
    if (addressTitipSplit) {
      if (!aiData.delivery_address || isWeakAddress(aiData.delivery_address)) {
        aiData.delivery_address = addressTitipSplit.delivery_address;
      }
      aiData.order_notes = addressTitipSplit.order_notes;
    }

    const baseItems = activeOrder?.items_summary || draftOrder?.items_summary || [];
    const aiItems = Array.isArray(aiData.items) ? aiData.items : [];
    const mergedItems = aiItems.length ? mergeItems(baseItems, aiItems, cleanText, true) : baseItems;
    const mergedPickup =
      cleanPickupName(aiData.pickup_location) ||
      cleanPickupName(draftOrder?.pickup_address) ||
      cleanPickupName(activeOrder?.pickup_address) ||
      null;
    const inferredPickup = cleanPickupName(mergedPickup || inferPickupFromText(mergedItems, cleanText));
    const deliveryCandidate = aiData.delivery_address && !isWeakAddress(aiData.delivery_address)
      ? aiData.delivery_address
      : null;
    const mergedAddress =
      deliveryCandidate ||
      draftOrder?.delivery_address ||
      activeOrder?.delivery_address ||
      null;

    // Override status check intent untuk pertanyaan status saja; jangan override bila pesan berisi instruksi catatan (titip/serah terima)
    const looksLikeStatusQuestion =
      /status/.test(lowerText) ||
      /udah sampai|sudah sampai|sampe mana|sampai mana/.test(lowerText) ||
      /pesanan.*mana/.test(lowerText) ||
      /(total|tagihan).*(berapa|nya)\b/.test(lowerText) ||
      /total\s?tagihan/.test(lowerText) ||
      /tagihannya/.test(lowerText);
    const looksLikeOrderNoteInstruction =
      /titip\s+(aja\s+)?ke\s+/i.test(lowerText) ||
      /tolong.*(titip|kasih|serah|sampai|pesenan)/i.test(lowerText) ||
      /kasih\s+pesenan/i.test(lowerText) ||
      /serah(kan)?\s+(ke|pesenan)/i.test(lowerText) ||
      /berikan\s+(ke|pesenan)/i.test(lowerText) ||
      /nanti\s+(tolong|titip)/i.test(lowerText);
    if (looksLikeStatusQuestion && !looksLikeOrderNoteInstruction) {
      intent = "CHECK_STATUS";
    }
    // Hanya anggap sebagai UPDATE_ORDER (update order berjalan) bila order memang ON_PROCESS/BILL_VALIDATION
    if (
      looksLikeOrderNoteInstruction &&
      extractOrderNote(cleanText) &&
      isUpdateOrderBerjalan
    ) {
      intent = "UPDATE_ORDER";
    }
    // Pelanggan punya order berjalan (ON_PROCESS/BILL_VALIDATION) + kirim item: anggap update order, bukan order baru
    if (
      isUpdateOrderBerjalan &&
      !draftOrder &&
      aiItems.length > 0 &&
      ["ORDER_COMPLETE", "ORDER_INCOMPLETE"].includes(intent)
    ) {
      intent = "UPDATE_ORDER";
    }

    // Jika ada update data, jangan dianggap confirm final
    if (
      intent === "CONFIRM_FINAL" &&
      (deliveryCandidate ||
        aiData.pickup_location ||
        aiItems.length > 0 ||
        (Array.isArray(aiData.order_notes) && aiData.order_notes.length > 0))
    ) {
      intent = "ORDER_COMPLETE";
    }

    // Persist alamat antar + catatan titip ke draft order segera (dari addressTitipSplit/aiData), agar selalu tersimpan ke DB sebelum reply apa pun
    const hasAddressOrNotesFromMessage =
      deliveryCandidate || (Array.isArray(aiData.order_notes) && aiData.order_notes.length > 0);
    if (
      draftOrder &&
      ["DRAFT", "PENDING_CONFIRMATION"].includes(draftOrder.status) &&
      hasAddressOrNotesFromMessage
    ) {
      if (deliveryCandidate) {
        await draftOrder.update({
          delivery_address: deliveryCandidate,
          raw_message: cleanText,
        });
      }
      if (Array.isArray(aiData.order_notes) && aiData.order_notes.length > 0) {
        await appendOrderNotes(draftOrder, aiData.order_notes);
      }
    }

    // PENDING LOCATION CONFIRMATION — jangan anggap pesan sebagai konfirmasi lokasi bila isinya update order (titip/serah)
    if (sessionDraft.pending_location_confirmation && !looksLikeOrderNoteInstruction) {
      const asksNewLocation =
        lowerText.includes("sharelok") ||
        lowerText.includes("share lok") ||
        lowerText.includes("share lokasi") ||
        lowerText.includes("kirim lokasi") ||
        lowerText.includes("kirim sharelok") ||
        lowerText.includes("salah lokasi") ||
        lowerText.includes("bukan itu");

      if (deliveryCandidate) {
        sessionDraft.pending_location_confirmation = false;
        sessionDraft.location_confirmed = false;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
      } else if (isNegative(lowerText) || asksNewLocation) {
        sessionDraft.pending_location_confirmation = false;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "REQUEST_LOCATION",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: draftOrder?.items_summary || [],
              pickup: draftOrder?.pickup_address || "",
              address: draftOrder?.delivery_address || "",
              notes: uniqueNotesList(draftOrder?.order_notes || []),
              flags: { needs_location: true },
              lastMessage: cleanText,
            }),
            [LOCATION_INSTRUCTION],
          ),
        };
      } else if (isConfirmingText(lowerText)) {
        sessionDraft.location_confirmed = true;
        sessionDraft.pending_location_confirmation = false;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

        if (draftOrder) {
          await draftOrder.update({ status: "PENDING_CONFIRMATION" });

          const validItems =
            Array.isArray(draftOrder.items_summary) && draftOrder.items_summary.length > 0;
          const validPickup = draftOrder.pickup_address?.length > 2;
          const validAddress = draftOrder.delivery_address?.length > 3;
          const hasLocation =
            user.latitude ||
            sessionDraft.has_coordinate ||
            (sessionDraft.coordinate && sessionDraft.coordinate.lat != null);
          const hasPickupCoord =
            sessionDraft.has_pickup_coordinate &&
            sessionDraft.pickup_coordinate?.lat != null &&
            sessionDraft.pickup_coordinate?.long != null;

          if (validItems && validPickup && validAddress && hasLocation && hasPickupCoord) {
            await draftOrder.update({
              status: "LOOKING_FOR_DRIVER",
              pickup_latitude: sessionDraft.pickup_coordinate.lat,
              pickup_longitude: sessionDraft.pickup_coordinate.long,
            });
            await user.update({
              address_text: draftOrder.delivery_address,
              last_order_date: new Date(),
            });
            await redisClient.del(redisKey);

            dispatchService
              .findDriverForOrder(draftOrder.order_id)
              .catch((err) => console.error("❌ Dispatch Error:", err));

            return {
              reply: await makeReply(
                "ORDER_CONFIRMED",
                buildUserContext({
                  user,
                  draftOrder,
                  items: draftOrder.items_summary,
                  pickup: draftOrder.pickup_address,
                  address: draftOrder.delivery_address,
                  notes: uniqueNotesList(draftOrder.order_notes || []),
                  flags: { searching_driver: true },
                  lastMessage: cleanText,
                }),
              ),
            };
          }

          return {
            reply: await makeReply(
              "ORDER_SUMMARY",
              buildUserContext({
                user,
                draftOrder,
                items: draftOrder.items_summary,
                pickup: draftOrder.pickup_address,
                address: draftOrder.delivery_address,
                notes: uniqueNotesList(draftOrder.order_notes || []),
                flags: { needs_confirmation: true },
                lastMessage: cleanText,
              }),
            ),
          };
        }
      }
    }

    // CATATAN FOTO SERAH TERIMA
    if (isPhotoNoteRequest(lowerText) && (activeOrder || draftOrder)) {
      const targetOrder = activeOrder || draftOrder;
      await appendOrderNotes(targetOrder, ["Minta foto serah terima di lokasi."]);
      await notifyCourierUpdate(targetOrder, {
        changes: ["note_added"],
        last_message: cleanText,
      });
      return {
        reply: await makeReply(
          "NOTE_ADDED",
          buildUserContext({
            user,
            draftOrder,
            activeOrder,
            items: targetOrder.items_summary || [],
            pickup: targetOrder.pickup_address || "",
            address: targetOrder.delivery_address || "",
            notes: uniqueNotesList(targetOrder.order_notes || []),
            changes: ["catatan foto serah terima"],
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // AUTO-CONFIRM WHEN USER SAYS OK/YA — jangan anggap konfirmasi bila pesan berisi update order (titip/serah) atau ada konfirmasi update tertunda
    if (
      draftOrder &&
      ["PENDING_CONFIRMATION", "DRAFT"].includes(draftOrder.status) &&
      !sessionDraft.pending_location_confirmation &&
      !sessionDraft.pending_order_update &&
      isConfirmingText(lowerText) &&
      !looksLikeOrderNoteInstruction
    ) {
      const validItems =
        Array.isArray(draftOrder.items_summary) && draftOrder.items_summary.length > 0;
      const validPickup = draftOrder.pickup_address?.length > 2;
      const validAddress = draftOrder.delivery_address?.length > 3;
      const hasLocation = user.latitude || sessionDraft.has_coordinate;

      if (!validItems) {
        return {
          reply: await makeReply(
            "ASK_ITEMS",
            buildUserContext({ user, draftOrder, lastMessage: cleanText }),
          ),
        };
      }
      if (!validPickup) {
        return {
          reply: await makeReply(
            "ASK_PICKUP",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              lastMessage: cleanText,
            }),
          ),
        };
      }
      if (!validAddress) {
        return {
          reply: await makeReply(
            "ASK_ADDRESS",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              lastMessage: cleanText,
            }),
          ),
        };
      }
      if (!hasLocation) {
        const hasSavedAddressFromPreviousOrder = (user.address_text || "").trim().length > 3;
        return {
          reply: await makeReply(
            hasSavedAddressFromPreviousOrder ? "REQUEST_LOCATION_CONFIRM_ADDRESS" : "REQUEST_LOCATION",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              address: draftOrder.delivery_address || "",
              notes: uniqueNotesList(draftOrder.order_notes || []),
              flags: {
                needs_location: true,
                ...(hasSavedAddressFromPreviousOrder && { last_address: user.address_text }),
              },
              lastMessage: cleanText,
            }),
            [LOCATION_INSTRUCTION],
          ),
        };
      }
      if (!sessionDraft.location_confirmed && user.latitude && user.longitude) {
        sessionDraft.pending_location_confirmation = true;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        const hasSavedAddress = (user.address_text || "").trim().length > 0;
        const followup = await makeReply(
          "CONFIRM_SAVED_LOCATION",
          buildUserContext({
            user,
            draftOrder,
            items: draftOrder.items_summary || [],
            pickup: draftOrder.pickup_address || "",
            address: draftOrder.delivery_address || "",
            notes: uniqueNotesList(draftOrder.order_notes || []),
            flags: {
              pending_location_confirmation: true,
              confirm_address_same: hasSavedAddress,
            },
            lastMessage: cleanText,
          }),
        );
        sendFollowupMessage(user.phone, followup);
        return {
          type: "location",
          latitude: parseFloat(user.latitude),
          longitude: parseFloat(user.longitude),
          address: draftOrder.delivery_address || "",
          reply: "",
        };
      }

      const hasPickupCoord =
        sessionDraft.has_pickup_coordinate &&
        sessionDraft.pickup_coordinate?.lat != null &&
        sessionDraft.pickup_coordinate?.long != null;
      if (!hasPickupCoord) {
        return {
          reply:
            "Lokasi antar sudah kami catat. Sekarang kirim juga *titik lokasi alamat pickup* (tempat ambil pesanan) ya kak — klik Clip (📎) -> Location -> Send Your Current Location.",
        };
      }

      await draftOrder.update({
        status: "LOOKING_FOR_DRIVER",
        pickup_latitude: sessionDraft.pickup_coordinate.lat,
        pickup_longitude: sessionDraft.pickup_coordinate.long,
      });
      await user.update({
        address_text: draftOrder.delivery_address,
        last_order_date: new Date(),
      });

      await redisClient.del(redisKey);

      dispatchService
        .findDriverForOrder(draftOrder.order_id)
        .catch((err) => console.error("❌ Dispatch Error:", err));

      return {
        reply: await makeReply(
          "ORDER_CONFIRMED",
          buildUserContext({
            user,
            draftOrder,
            items: draftOrder.items_summary || [],
            pickup: draftOrder.pickup_address || "",
            address: draftOrder.delivery_address || "",
            notes: uniqueNotesList(draftOrder.order_notes || []),
            flags: { searching_driver: true },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // UPDATE STATUS ORDER
    if (intent === "CHECK_STATUS") {
      const asksTotalTagihan =
        /(total|tagihan).*(berapa|nya)\b/.test(lowerText) ||
        /total\s?tagihan/.test(lowerText) ||
        /tagihannya/.test(lowerText);
      const wantsOrderDetails = /(detail|rincian|ringkasan|menu|item|daftar|orderan|\border\b)/i.test(
        lowerText,
      );
      if (activeOrder) {
        const freshOrder = await Order.findOne({
          where: { order_id: activeOrder.order_id },
          include: [{ model: Courier, as: "courier" }],
        });
        const orderForReply = freshOrder || activeOrder;
        const totalAllowed = ["BILL_SENT", "COMPLETED"].includes(orderForReply.status);
        const rawTotal = Number(orderForReply.total_amount || 0);
        const totalPhrase =
          asksTotalTagihan && totalAllowed
            ? `Total tagihan: Rp${Math.round(rawTotal).toLocaleString("id-ID")}`
            : null;
        if (asksTotalTagihan && !totalAllowed) {
          return {
            reply: await makeReply(
              "TOTAL_NOT_READY",
              buildUserContext({
                user,
                activeOrder: orderForReply,
                items: orderForReply.items_summary || [],
                pickup: orderForReply.pickup_address || "",
                address: orderForReply.delivery_address || "",
                notes: uniqueNotesList(orderForReply.order_notes || []),
                flags: { status: orderForReply.status, show_details: false },
                lastMessage: cleanText,
              }),
            ),
          };
        }
        if (
          orderForReply.courier &&
          orderForReply.courier.current_latitude &&
          orderForReply.courier.current_longitude &&
          ["ON_PROCESS", "BILL_VALIDATION", "BILL_SENT"].includes(orderForReply.status)
        ) {
          const statusKey =
            asksTotalTagihan && totalAllowed ? "TOTAL_WITH_LOCATION" : "STATUS_WITH_LOCATION";
          const followup = await makeReply(
            statusKey,
            buildUserContext({
              user,
              activeOrder: orderForReply,
              items: orderForReply.items_summary || [],
              pickup: orderForReply.pickup_address || "",
              address: orderForReply.delivery_address || "",
              notes: uniqueNotesList(orderForReply.order_notes || []),
              flags: { status: orderForReply.status, show_details: wantsOrderDetails },
              lastMessage: cleanText,
            }),
            totalPhrase ? [totalPhrase] : [],
          );
          sendFollowupMessage(user.phone, followup);
          return {
            type: "location",
            latitude: parseFloat(orderForReply.courier.current_latitude),
            longitude: parseFloat(orderForReply.courier.current_longitude),
            address: orderForReply.delivery_address || "",
            reply: "",
          };
        }

        return {
          reply: await makeReply(
            asksTotalTagihan && totalAllowed ? "TOTAL_STATUS" : "STATUS_ONLY",
            buildUserContext({
              user,
              activeOrder: orderForReply,
              items: orderForReply.items_summary || [],
              pickup: orderForReply.pickup_address || "",
              address: orderForReply.delivery_address || "",
              notes: uniqueNotesList(orderForReply.order_notes || []),
              flags: {
                status: orderForReply.status,
                show_details: wantsOrderDetails,
                total_amount:
                  asksTotalTagihan && totalAllowed ? orderForReply.total_amount || 0 : undefined,
              },
              lastMessage: cleanText,
            }),
            totalPhrase ? [totalPhrase] : [],
          ),
        };
      }
      if (draftOrder) {
        return {
          reply: await makeReply(
            "DRAFT_PENDING_CONFIRM",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              address: draftOrder.delivery_address || "",
              notes: uniqueNotesList(draftOrder.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }
      return {
        reply: await makeReply(
          "NO_ACTIVE_ORDER",
          buildUserContext({ user, lastMessage: cleanText }),
        ),
      };
    }

    // PENDING ORDER UPDATE CONFIRMATION
    if (sessionDraft.pending_order_update) {
      const pendingUpdate = sessionDraft.pending_order_update;
      const targetOrder =
        (activeOrder && activeOrder.order_id === pendingUpdate.order_id
          ? activeOrder
          : draftOrder && draftOrder.order_id === pendingUpdate.order_id
          ? draftOrder
          : await Order.findByPk(pendingUpdate.order_id));
      const freshOrder = targetOrder ? await Order.findByPk(targetOrder.order_id) : null;

      const isOrderEditable =
        freshOrder && !["COMPLETED", "BILL_SENT", "CANCELLED"].includes(freshOrder.status);

      if (!freshOrder || !isOrderEditable) {
        sessionDraft.pending_order_update = null;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "UPDATE_NOT_ALLOWED",
            buildUserContext({
              user,
              activeOrder,
              items: freshOrder?.items_summary || [],
              pickup: freshOrder?.pickup_address || "",
              address: freshOrder?.delivery_address || "",
              notes: uniqueNotesList(freshOrder?.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }

      if (isAffirmative(lowerText)) {
        await freshOrder.update({
          items_summary: pendingUpdate.items || freshOrder.items_summary,
          pickup_address: pendingUpdate.pickup_address || freshOrder.pickup_address,
          delivery_address: pendingUpdate.delivery_address || freshOrder.delivery_address,
          raw_message: pendingUpdate.raw_message || cleanText,
        });

        if (Array.isArray(pendingUpdate.update_notes) && pendingUpdate.update_notes.length) {
          await appendOrderNotes(freshOrder, pendingUpdate.update_notes);
        }

        if (pendingUpdate.wants_remove_note) {
          await removeOrderNotes(freshOrder, pendingUpdate.remove_notes || []);
        }

        if (sessionDraft.pending_addon_details) {
          sessionDraft.pending_addon_details = false;
        }

        sessionDraft.pending_order_update = null;

        const combinedUpdateNotes = [
          ...(freshOrder.order_notes || []),
          ...(pendingUpdate.update_notes || []),
        ].filter(Boolean);

        await notifyCourierUpdate(freshOrder, {
          changes: pendingUpdate.changes || [],
          last_message: pendingUpdate.raw_message || cleanText,
        });

        const isDraftAfterUpdate =
          freshOrder && ["DRAFT", "PENDING_CONFIRMATION"].includes(freshOrder.status);
        const hasLocation =
          user.latitude ||
          user.longitude ||
          sessionDraft.has_coordinate ||
          (sessionDraft.coordinate && sessionDraft.coordinate.lat != null);
        if (isDraftAfterUpdate && hasLocation) {
          sessionDraft.pending_location_confirmation = true;
          await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
          const hasSavedAddressReturning = (user.address_text || "").trim().length > 0;
          const followup = await makeReply(
            "CONFIRM_SAVED_LOCATION",
            buildUserContext({
              user,
              draftOrder: freshOrder,
              items: freshOrder.items_summary || [],
              pickup: freshOrder.pickup_address || "",
              address: freshOrder.delivery_address || "",
              notes: uniqueNotesList(combinedUpdateNotes),
              flags: {
                pending_location_confirmation: true,
                confirm_address_same: hasSavedAddressReturning,
              },
              lastMessage: cleanText,
            }),
          );
          sendFollowupMessage(user.phone, followup);
          return {
            type: "location",
            latitude: user.latitude ? parseFloat(user.latitude) : sessionDraft.coordinate?.lat,
            longitude: user.longitude ? parseFloat(user.longitude) : sessionDraft.coordinate?.lng,
            address: freshOrder.delivery_address || "",
            reply: "",
          };
        }

        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "ORDER_UPDATE_APPLIED",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: pendingUpdate.items || freshOrder.items_summary || [],
              pickup: freshOrder.pickup_address || "",
              address: freshOrder.delivery_address || "",
              notes: uniqueNotesList(combinedUpdateNotes),
              changes: pendingUpdate.changes || [],
              updateItems: pendingUpdate.update_items || [],
              updateNotes: pendingUpdate.update_notes || [],
              flags: {
                show_details: false,
                address_update_blocked: pendingUpdate.address_update_blocked,
                pickup_update_blocked: pendingUpdate.pickup_update_blocked,
              },
              lastMessage: cleanText,
            }),
          ),
        };
      }

      if (isNegative(lowerText)) {
        sessionDraft.pending_order_update = null;
        sessionDraft.pending_addon_details = false;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "ORDER_UPDATE_CANCELLED",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: freshOrder.items_summary || [],
              pickup: freshOrder.pickup_address || "",
              address: freshOrder.delivery_address || "",
              notes: uniqueNotesList(freshOrder.order_notes || []),
              flags: { show_details: false },
              lastMessage: cleanText,
            }),
          ),
        };
      }

      const wantsRemoveItem =
        ["hapus", "batal", "gak jadi", "nggak jadi", "cancel"].some((w) => lowerText.includes(w)) &&
        aiItems.length;
      const wantsRemoveNote = lowerText.includes("hapus catatan") || lowerText.includes("hapus note");
      const noteCandidate = extractOrderNote(cleanText);
      const noteCandidates = [
        ...(noteCandidate ? [noteCandidate] : []),
        ...(Array.isArray(aiData.order_notes) ? aiData.order_notes : []),
      ].filter(Boolean);

      const hasUpdateSignal =
        aiItems.length ||
        noteCandidates.length ||
        deliveryCandidate ||
        aiData.pickup_location ||
        wantsRemoveItem ||
        wantsRemoveNote;

      if (hasUpdateSignal) {
        const canUpdateAddress = ["DRAFT", "PENDING_CONFIRMATION"].includes(freshOrder.status);
        let itemsUpdated = false;
        let notesUpdated = false;
        let addressUpdated = false;
        let pickupUpdated = false;
        let addressUpdateBlocked = pendingUpdate.address_update_blocked || false;
        let pickupUpdateBlocked = pendingUpdate.pickup_update_blocked || false;

        const baseItems =
          Array.isArray(pendingUpdate.items) && pendingUpdate.items.length
            ? pendingUpdate.items
            : Array.isArray(freshOrder.items_summary)
            ? freshOrder.items_summary
            : [];
        let newItems = baseItems;

        if (wantsRemoveItem) {
          const removeNames = aiData.remove_items?.length
            ? aiData.remove_items
            : aiItems.map((i) => i.item);
          newItems = removeItemsByName(newItems, removeNames);
          itemsUpdated = true;
        } else if (aiItems.length) {
          newItems = mergeItems(newItems, aiItems, cleanText, true);
          itemsUpdated = true;
        }

        let updateNotes = Array.isArray(pendingUpdate.update_notes) ? pendingUpdate.update_notes : [];
        if (noteCandidates.length) {
          updateNotes = noteCandidates;
          notesUpdated = true;
        }
        if (wantsRemoveNote) {
          notesUpdated = true;
        }

        let pickupAddress =
          pendingUpdate.pickup_address || freshOrder.pickup_address || "";
        let deliveryAddress =
          pendingUpdate.delivery_address || freshOrder.delivery_address || "";

        if (aiData.pickup_location) {
          if (canUpdateAddress) {
            pickupAddress = cleanPickupName(aiData.pickup_location);
            pickupUpdated = true;
          } else {
            pickupUpdateBlocked = true;
          }
        }

        if (deliveryCandidate) {
          if (canUpdateAddress) {
            deliveryAddress = deliveryCandidate;
            addressUpdated = true;
          } else {
            addressUpdateBlocked = true;
          }
        }

        const updateItemsPreview = (() => {
          if (wantsRemoveItem) {
            const removeNames = aiData.remove_items?.length
              ? aiData.remove_items
              : aiItems.map((i) => i.item);
            return removeNames.map((name) => ({
              item: `Hapus ${canonicalizeItemLabel(name)}`,
              qty: 1,
            }));
          }
          if (aiItems.length) {
            return aiItems.map((incoming) => ({
              item: canonicalizeItemLabel(incoming.item) || incoming.item,
              qty:
                newItems.find(
                  (item) => normalizeItemName(item.item) === normalizeItemName(incoming.item),
                )?.qty ||
                incoming.qty ||
                1,
              note:
                newItems.find(
                  (item) => normalizeItemName(item.item) === normalizeItemName(incoming.item),
                )?.note ||
                incoming.note ||
                "",
            }));
          }
          const fallback = [];
          if (addressUpdated) {
            fallback.push({ item: "Update alamat antar", qty: 1 });
          }
          if (pickupUpdated) {
            fallback.push({ item: "Update alamat pickup", qty: 1 });
          }
          if (wantsRemoveNote && !updateNotes.length) {
            fallback.push({ item: "Hapus catatan", qty: 1 });
          }
          return fallback;
        })();

        const changes = [
          itemsUpdated ? "items_updated" : null,
          notesUpdated ? "notes_updated" : null,
          addressUpdated || pickupUpdated ? "address_updated" : null,
        ].filter(Boolean);

        sessionDraft.pending_order_update = {
          ...pendingUpdate,
          items: newItems,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          update_notes: updateNotes,
          remove_notes: aiData.remove_notes || pendingUpdate.remove_notes || [],
          wants_remove_note: wantsRemoveNote || pendingUpdate.wants_remove_note,
          update_items: updateItemsPreview,
          changes,
          raw_message: cleanText,
          address_update_blocked: addressUpdateBlocked,
          pickup_update_blocked: pickupUpdateBlocked,
        };

        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

        return {
          reply: await makeReply(
            "ORDER_UPDATE_CONFIRMATION",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: newItems,
              pickup: pickupAddress || "",
              address: deliveryAddress || "",
              notes: uniqueNotesList(freshOrder.order_notes || []),
              changes,
              updateItems: updateItemsPreview,
              updateNotes,
              flags: {
                show_details: false,
                needs_confirmation: true,
                address_update_blocked: addressUpdateBlocked,
                pickup_update_blocked: pickupUpdateBlocked,
              },
              lastMessage: cleanText,
            }),
            ["Kalau sudah sesuai, balas *OK/YA* ya kak."],
          ),
        };
      }

      return {
        reply: await makeReply(
          "ORDER_UPDATE_CONFIRMATION",
          buildUserContext({
            user,
            draftOrder,
            activeOrder,
          items: freshOrder.items_summary || [],
          pickup: freshOrder.pickup_address || "",
          address: freshOrder.delivery_address || "",
          notes: uniqueNotesList(freshOrder.order_notes || []),
            changes: pendingUpdate.changes || [],
            updateItems: pendingUpdate.update_items || [],
            updateNotes: pendingUpdate.update_notes || [],
            flags: {
              show_details: false,
              needs_confirmation: true,
              address_update_blocked: pendingUpdate.address_update_blocked,
              pickup_update_blocked: pendingUpdate.pickup_update_blocked,
            },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // CANCEL ORDER
    if (intent === "CANCEL") {
      if (draftOrder) {
        await draftOrder.update({ status: "CANCELLED" });
        await redisClient.del(redisKey);
        return {
          reply: await makeReply(
            "ORDER_CANCELLED",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              address: draftOrder.delivery_address || "",
              notes: uniqueNotesList(draftOrder.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }
      if (activeOrder?.status === "LOOKING_FOR_DRIVER") {
        await activeOrder.update({ status: "CANCELLED" });
        return {
          reply: await makeReply(
            "ORDER_CANCELLED",
            buildUserContext({
              user,
              activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }
      return {
        reply: await makeReply(
          "CANCEL_NOT_ALLOWED",
          buildUserContext({
            user,
            activeOrder,
            items: activeOrder?.items_summary || [],
            pickup: activeOrder?.pickup_address || "",
            address: activeOrder?.delivery_address || "",
            notes: uniqueNotesList(activeOrder?.order_notes || []),
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // INTRO PEMESANAN: pelanggan baru mau pesan (tanpa detail) -> minta tulis pesanan lengkap. Jangan tampilkan jika pesan sudah berisi item+jumlah (biarkan flow ORDER_INCOMPLETE/ORDER_COMPLETE yang tangani).
    const looksLikeHasItemAndQty =
      (/\d+\s*(porsi|gelas|buah|pcs|rb|ribu|k)\b/i.test(lowerText) ||
        /\b(satu|dua|se)\s*(porsi|gelas|buah)/i.test(lowerText)) &&
      /(nasi|mie|goreng|teh|kopi|es|ayam|bakso|soto|pedas|manis|pizza|burger|nasgor|pisgor|porsi)/i.test(lowerText);
    if (
      intent === "CHITCHAT" &&
      (isPolite(lowerText) || isGreeting(lowerText)) &&
      isIntroToOrder(lowerText) &&
      !draftOrder &&
      !activeOrder &&
      !aiItems.length &&
      !looksLikeHasItemAndQty
    ) {
      return {
        reply: await makeReply(
          "ORDER_INTRO_ASK_DETAILS",
          buildUserContext({
            user,
            activeOrder,
            items: [],
            pickup: "",
            address: "",
            notes: [],
            flags: { intro_to_order: true },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // POLITE RESPONSE (sapaan + ucapan sopan)
    if (intent === "CHITCHAT" && (isPolite(lowerText) || isGreeting(lowerText)) && !draftOrder) {
      return {
        reply: await makeReply(
          "POLITE_RESPONSE",
          buildUserContext({
            user,
            activeOrder,
            items: activeOrder?.items_summary || [],
            pickup: activeOrder?.pickup_address || "",
            address: activeOrder?.delivery_address || "",
            notes: uniqueNotesList(activeOrder?.order_notes || []),
            flags: { status: activeOrder?.status || "NONE" },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // ADD-ON REQUEST FLOW
    if (isAddOnRequest(lowerText) && (activeOrder || draftOrder)) {
      if (!aiItems.length && !sessionDraft.pending_addon_details) {
        sessionDraft.pending_addon_confirmation = true;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "ADDON_CONFIRM",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: (activeOrder || draftOrder)?.items_summary || [],
              pickup: (activeOrder || draftOrder)?.pickup_address || "",
              address: (activeOrder || draftOrder)?.delivery_address || "",
              notes: uniqueNotesList((activeOrder || draftOrder)?.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }
    }

    if (sessionDraft.pending_addon_confirmation) {
      if (isAffirmative(lowerText)) {
        sessionDraft.pending_addon_confirmation = false;
        sessionDraft.pending_addon_details = true;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "ADDON_ASK_DETAILS",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: (activeOrder || draftOrder)?.items_summary || [],
              pickup: (activeOrder || draftOrder)?.pickup_address || "",
              address: (activeOrder || draftOrder)?.delivery_address || "",
              notes: uniqueNotesList((activeOrder || draftOrder)?.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }
      if (isNegative(lowerText)) {
        sessionDraft.pending_addon_confirmation = false;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        return {
          reply: await makeReply(
            "ADDON_CANCELLED",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: (activeOrder || draftOrder)?.items_summary || [],
              pickup: (activeOrder || draftOrder)?.pickup_address || "",
              address: (activeOrder || draftOrder)?.delivery_address || "",
              notes: uniqueNotesList((activeOrder || draftOrder)?.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }
    }

    if (sessionDraft.pending_addon_details && !aiItems.length) {
      return {
        reply: await makeReply(
          "ADDON_ASK_DETAILS",
          buildUserContext({
            user,
            draftOrder,
            activeOrder,
            items: (activeOrder || draftOrder)?.items_summary || [],
            pickup: (activeOrder || draftOrder)?.pickup_address || "",
            address: (activeOrder || draftOrder)?.delivery_address || "",
            notes: uniqueNotesList((activeOrder || draftOrder)?.order_notes || []),
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // UPDATE ORDER (ADD/REMOVE/NOTES)
    const shouldUpdateOrder =
      intent === "UPDATE_ORDER" ||
      sessionDraft.pending_addon_details ||
      (isAddOnRequest(lowerText) && aiItems.length) ||
      lowerText.includes("hapus catatan") ||
      lowerText.includes("hapus note");

    const isDraftEditable =
      draftOrder && ["DRAFT", "PENDING_CONFIRMATION"].includes(draftOrder.status);

    if (
      (activeOrder ||
        sessionDraft.pending_addon_details ||
        (!isDraftEditable && draftOrder) ||
        (draftOrder && intent === "UPDATE_ORDER")) &&
      shouldUpdateOrder
    ) {
      const targetOrder = activeOrder || draftOrder;
      if (!targetOrder) {
        return {
          reply: await makeReply(
            "NO_ACTIVE_ORDER",
            buildUserContext({ user, lastMessage: cleanText }),
          ),
        };
      }

      const isOrderEditable =
        targetOrder && !["COMPLETED", "BILL_SENT", "CANCELLED"].includes(targetOrder.status);
      if (!isOrderEditable) {
        return {
          reply: await makeReply(
            "UPDATE_NOT_ALLOWED",
            buildUserContext({
              user,
              activeOrder,
              items: targetOrder.items_summary || [],
              pickup: targetOrder.pickup_address || "",
              address: targetOrder.delivery_address || "",
              notes: uniqueNotesList(targetOrder.order_notes || []),
              lastMessage: cleanText,
            }),
          ),
        };
      }

      const wantsRemoveItem =
        ["hapus", "batal", "gak jadi", "nggak jadi", "cancel"].some((w) =>
          lowerText.includes(w),
        ) && aiItems.length;
      const wantsRemoveNote = lowerText.includes("hapus catatan") || lowerText.includes("hapus note");

      let updated = false;
      let itemsUpdated = false;
      let notesUpdated = false;
      let addressUpdated = false;
      let pickupUpdated = false;
      let addressUpdateBlocked = false;
      let pickupUpdateBlocked = false;
      const canUpdateAddress = ["DRAFT", "PENDING_CONFIRMATION"].includes(targetOrder.status);
      let newItems = Array.isArray(targetOrder.items_summary) ? targetOrder.items_summary : [];
      let updateNotes = [];
      const noteCandidate = extractOrderNote(cleanText);
      const noteCandidates = [
        ...(noteCandidate ? [noteCandidate] : []),
        ...(Array.isArray(aiData.order_notes) ? aiData.order_notes : []),
      ].filter(Boolean);

      if (wantsRemoveItem) {
        const removeNames = aiData.remove_items?.length
          ? aiData.remove_items
          : aiItems.map((i) => i.item);
        newItems = removeItemsByName(newItems, removeNames);
        updated = true;
        itemsUpdated = true;
      } else if (aiItems.length) {
        newItems = mergeItems(newItems, aiItems, cleanText, true);
        updated = true;
        itemsUpdated = true;
      }

      if (aiData.pickup_location) {
        if (canUpdateAddress) {
          targetOrder.pickup_address = cleanPickupName(aiData.pickup_location);
          updated = true;
          pickupUpdated = true;
        } else {
          pickupUpdateBlocked = true;
        }
      }

      if (deliveryCandidate) {
        if (canUpdateAddress) {
          targetOrder.delivery_address = deliveryCandidate;
          updated = true;
          addressUpdated = true;
        } else {
          addressUpdateBlocked = true;
        }
      }

      if (noteCandidates.length) {
        updateNotes = noteCandidates;
        updated = true;
        notesUpdated = true;
      }

      if (wantsRemoveNote) {
        updated = true;
        notesUpdated = true;
      }

      if (updated) {
        const isDraftStatus = ["DRAFT", "PENDING_CONFIRMATION"].includes(targetOrder.status);
        const notesOnlyUpdate =
          notesUpdated &&
          !itemsUpdated &&
          !addressUpdated &&
          !pickupUpdated &&
          !wantsRemoveNote;
        // Draft + hanya catatan: simpan ke DB langsung (tanpa minta OK terpisah) agar order_notes terisi
        const needsUpdateConfirmation = !(isDraftStatus && notesOnlyUpdate);
        const updateItemsPreview = (() => {
          if (wantsRemoveItem) {
            const removeNames = aiData.remove_items?.length
              ? aiData.remove_items
              : aiItems.map((i) => i.item);
            return removeNames.map((name) => ({
              item: `Hapus ${canonicalizeItemLabel(name)}`,
              qty: 1,
            }));
          }
          if (aiItems.length) {
            return aiItems.map((incoming) => ({
              item: canonicalizeItemLabel(incoming.item) || incoming.item,
              qty:
                newItems.find(
                  (item) => normalizeItemName(item.item) === normalizeItemName(incoming.item),
                )?.qty ||
                incoming.qty ||
                1,
              note:
                newItems.find(
                  (item) => normalizeItemName(item.item) === normalizeItemName(incoming.item),
                )?.note ||
                incoming.note ||
                "",
            }));
          }
          const fallback = [];
          if (addressUpdated) {
            fallback.push({ item: "Update alamat antar", qty: 1 });
          }
          if (pickupUpdated) {
            fallback.push({ item: "Update alamat pickup", qty: 1 });
          }
          if (wantsRemoveNote && !updateNotes.length) {
            fallback.push({ item: "Hapus catatan", qty: 1 });
          }
          return fallback;
        })();

        const changes = [
          itemsUpdated ? "items_updated" : null,
          notesUpdated ? "notes_updated" : null,
          addressUpdated || pickupUpdated ? "address_updated" : null,
        ].filter(Boolean);

        if (isDraftStatus && notesOnlyUpdate && updateNotes.length) {
          await appendOrderNotes(targetOrder, updateNotes);
          const afterNotes = [...(targetOrder.order_notes || []), ...updateNotes].filter(Boolean);
          return {
            reply: await makeReply(
              "ORDER_SUMMARY",
              buildUserContext({
                user,
                draftOrder: targetOrder,
                activeOrder,
                items: newItems,
                pickup: targetOrder.pickup_address || "",
                address: targetOrder.delivery_address || "",
                notes: uniqueNotesList(afterNotes),
                flags: { needs_confirmation: true, show_details: true },
                lastMessage: cleanText,
              }),
            ),
          };
        }

        // Buat order baru (draft): simpan langsung ke DB dan balas ringkasan order + langkah berikutnya (bukan skema "Update pesanan")
        if (isDraftStatus && !isUpdateOrderBerjalan && needsUpdateConfirmation) {
          await targetOrder.update({
            items_summary: newItems,
            pickup_address: targetOrder.pickup_address,
            delivery_address: targetOrder.delivery_address,
            raw_message: cleanText,
          });
          if (updateNotes.length) {
            await appendOrderNotes(targetOrder, updateNotes);
          }
          const combinedDraftNotes = [
            ...(targetOrder.order_notes || []),
            ...updateNotes,
          ].filter(Boolean);
          return {
            reply: await makeReply(
              addressUpdated ? "ORDER_SUMMARY_ADDRESS_UPDATED" : "ORDER_SUMMARY",
              buildUserContext({
                user,
                draftOrder: targetOrder,
                activeOrder,
                items: newItems,
                pickup: targetOrder.pickup_address || "",
                address: targetOrder.delivery_address || "",
                notes: uniqueNotesList(combinedDraftNotes),
                flags: {
                  needs_confirmation: true,
                  show_details: true,
                  address_updated: addressUpdated,
                },
                lastMessage: cleanText,
              }),
            ),
          };
        }

        if (needsUpdateConfirmation) {
          sessionDraft.pending_order_update = {
            order_id: targetOrder.order_id,
            items: newItems,
            pickup_address: targetOrder.pickup_address,
            delivery_address: targetOrder.delivery_address,
            update_notes: updateNotes,
            remove_notes: aiData.remove_notes || [],
            wants_remove_note: wantsRemoveNote,
            update_items: updateItemsPreview,
            changes,
            raw_message: cleanText,
            address_update_blocked: addressUpdateBlocked,
            pickup_update_blocked: pickupUpdateBlocked,
          };

          if (sessionDraft.pending_addon_details) {
            sessionDraft.pending_addon_details = false;
          }

          await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

          return {
            reply: await makeReply(
              "ORDER_UPDATE_CONFIRMATION",
              buildUserContext({
                user,
                draftOrder,
                activeOrder,
                items: newItems,
                pickup: targetOrder.pickup_address || "",
                address: targetOrder.delivery_address || "",
                notes: uniqueNotesList(targetOrder.order_notes || []),
                changes,
                updateItems: updateItemsPreview,
                updateNotes,
                flags: {
                  show_details: isDraftStatus,
                  needs_confirmation: true,
                  address_update_blocked: addressUpdateBlocked,
                  pickup_update_blocked: pickupUpdateBlocked,
                },
                lastMessage: cleanText,
              }),
              ["Kalau sudah sesuai, balas *OK/YA* ya kak."],
            ),
          };
        }

        await targetOrder.update({
          items_summary: newItems,
          pickup_address: targetOrder.pickup_address,
          delivery_address: targetOrder.delivery_address,
          raw_message: cleanText,
        });

        if (updateNotes.length) {
          await appendOrderNotes(targetOrder, updateNotes);
        }

        if (wantsRemoveNote) {
          await removeOrderNotes(targetOrder, aiData.remove_notes || []);
        }

        if (sessionDraft.pending_addon_details) {
          sessionDraft.pending_addon_details = false;
          await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        }

        const combinedUpdateNotes = [
          ...(targetOrder.order_notes || []),
          ...updateNotes,
        ].filter(Boolean);

        await notifyCourierUpdate(targetOrder, {
          changes,
          last_message: cleanText,
        });

        return {
          reply: await makeReply(
            "ORDER_UPDATE_APPLIED",
            buildUserContext({
              user,
              draftOrder,
              activeOrder,
              items: newItems,
              pickup: targetOrder.pickup_address || "",
              address: targetOrder.delivery_address || "",
              notes: uniqueNotesList(combinedUpdateNotes),
              changes,
              updateItems: updateItemsPreview,
              updateNotes,
              flags: {
                show_details: ["DRAFT", "PENDING_CONFIRMATION"].includes(targetOrder.status),
                address_update_blocked: addressUpdateBlocked,
                pickup_update_blocked: pickupUpdateBlocked,
              },
              lastMessage: cleanText,
            }),
          ),
        };
      }
    }

    // CONFIRM FINAL ORDER
    if (intent === "CONFIRM_FINAL" && draftOrder) {
      const validItems = Array.isArray(draftOrder.items_summary) && draftOrder.items_summary.length > 0;
      const validPickup = draftOrder.pickup_address?.length > 2;
      const validAddress = draftOrder.delivery_address?.length > 3;
      const hasLocation =
        user.latitude ||
        sessionDraft.has_coordinate ||
        (sessionDraft.coordinate && sessionDraft.coordinate.lat != null);
      const isConfirming = isConfirmingText(lowerText);

      if (!validItems) {
        return {
          reply: await makeReply(
            "ASK_ITEMS",
            buildUserContext({ user, draftOrder, lastMessage: cleanText }),
          ),
        };
      }
      if (!validPickup) {
        return {
          reply: await makeReply(
            "ASK_PICKUP",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              lastMessage: cleanText,
            }),
          ),
        };
      }
      if (!validAddress) {
        return {
          reply: await makeReply(
            "ASK_ADDRESS",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              lastMessage: cleanText,
            }),
          ),
        };
      }
      if (!hasLocation) {
        const hasSavedAddressFromPreviousOrder = (user.address_text || "").trim().length > 3;
        return {
          reply: await makeReply(
            hasSavedAddressFromPreviousOrder ? "REQUEST_LOCATION_CONFIRM_ADDRESS" : "REQUEST_LOCATION",
            buildUserContext({
              user,
              draftOrder,
              items: draftOrder.items_summary || [],
              pickup: draftOrder.pickup_address || "",
              address: draftOrder.delivery_address || "",
              notes: uniqueNotesList(draftOrder.order_notes || []),
              flags: {
                needs_location: true,
                show_details: true,
                ...(hasSavedAddressFromPreviousOrder && { last_address: user.address_text }),
              },
              lastMessage: cleanText,
            }),
            [LOCATION_INSTRUCTION],
          ),
        };
      }

      if (isConfirming && !sessionDraft.location_confirmed && hasLocation) {
        sessionDraft.location_confirmed = true;
        sessionDraft.pending_location_confirmation = false;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
      }

      if (
        !sessionDraft.location_confirmed &&
        hasLocation &&
        !looksLikeOrderNoteInstruction
      ) {
        sessionDraft.pending_location_confirmation = true;
        await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });
        const hasSavedAddressReturning = (user.address_text || "").trim().length > 0;
        const followup = await makeReply(
          "CONFIRM_SAVED_LOCATION",
          buildUserContext({
            user,
            draftOrder,
            items: draftOrder.items_summary || [],
            pickup: draftOrder.pickup_address || "",
            address: draftOrder.delivery_address || "",
            notes: uniqueNotesList(draftOrder.order_notes || []),
            flags: {
              pending_location_confirmation: true,
              confirm_address_same: hasSavedAddressReturning,
              show_details: true,
            },
            lastMessage: cleanText,
          }),
        );
        sendFollowupMessage(user.phone, followup);
        return {
          type: "location",
          latitude: parseFloat(user.latitude),
          longitude: parseFloat(user.longitude),
          address: draftOrder.delivery_address || "",
          reply: "",
        };
      }

      const hasPickupCoordLate =
        sessionDraft.has_pickup_coordinate &&
        sessionDraft.pickup_coordinate?.lat != null &&
        sessionDraft.pickup_coordinate?.long != null;
      if (!hasPickupCoordLate) {
        return {
          reply:
            "Lokasi antar sudah kami catat. Sekarang kirim juga *titik lokasi alamat pickup* (tempat ambil pesanan) ya kak — klik Clip (📎) -> Location -> Send Your Current Location.",
        };
      }

      await draftOrder.update({
        status: "LOOKING_FOR_DRIVER",
        pickup_latitude: sessionDraft.pickup_coordinate.lat,
        pickup_longitude: sessionDraft.pickup_coordinate.long,
      });
      await user.update({
        address_text: draftOrder.delivery_address,
        last_order_date: new Date(),
      });

      await redisClient.del(redisKey);

      dispatchService
        .findDriverForOrder(draftOrder.order_id)
        .catch((err) => console.error("❌ Dispatch Error:", err));

      return {
        reply: await makeReply(
          "ORDER_CONFIRMED",
          buildUserContext({
            user,
            draftOrder,
            items: draftOrder.items_summary || [],
            pickup: draftOrder.pickup_address || "",
            address: draftOrder.delivery_address || "",
            notes: uniqueNotesList(draftOrder.order_notes || []),
            flags: { searching_driver: true },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    // DRAFT / ORDER CREATION
    if (["ORDER_INCOMPLETE", "ORDER_COMPLETE", "UPDATE_ORDER"].includes(intent)) {
      if (!draftOrder && activeOrder) {
        const orderUpdateBlocked = ["BILL_SENT", "COMPLETED"].includes(activeOrder.status);
        return {
          reply: await makeReply(
            "ORDER_IN_PROGRESS",
            buildUserContext({
              user,
              activeOrder,
              items: activeOrder.items_summary || [],
              pickup: activeOrder.pickup_address || "",
              address: activeOrder.delivery_address || "",
              notes: uniqueNotesList(activeOrder.order_notes || []),
              flags: {
                order_update_blocked: orderUpdateBlocked,
                order_status: activeOrder.status,
              },
              lastMessage: cleanText,
            }),
          ),
        };
      }

      let currentDraft = draftOrder;
      if (currentDraft) {
        await currentDraft.update({
          items_summary: mergedItems,
          pickup_address: inferredPickup,
          delivery_address: mergedAddress,
          raw_message: cleanText,
        });
      } else {
        if (!mergedItems.length) {
          return {
            reply: await makeReply(
              "ASK_ITEMS",
              buildUserContext({ user, lastMessage: cleanText }),
            ),
          };
        }
        const addr = mergedAddress || "";
        currentDraft = await orderService.createFromAI(realPhone, {
          items: mergedItems,
          pickup_location: inferredPickup,
          delivery_address: addr,
          original_message: cleanText,
        });
      }

      sessionDraft = { ...sessionDraft, ...aiData };
      await redisClient.set(redisKey, JSON.stringify(sessionDraft), { EX: 3600 });

      const finalAddress = mergedAddress || currentDraft?.delivery_address || "";
      const hasItems = mergedItems.length > 0;
      const hasPickup = inferredPickup && inferredPickup.length > 2;
      const hasAddress = finalAddress && finalAddress.length > 3;
      const noteCandidate = extractOrderNote(cleanText);
      const noteCandidates = [
        ...(noteCandidate ? [noteCandidate] : []),
        ...(Array.isArray(aiData.order_notes) ? aiData.order_notes : []),
      ].filter(Boolean);
      const combinedDraftNotes = [
        ...(currentDraft?.order_notes || []),
        ...noteCandidates,
      ].filter(Boolean);
      if (noteCandidates.length && currentDraft) {
        await appendOrderNotes(currentDraft, noteCandidates);
      }

      if (hasItems && hasPickup && hasAddress) {
        const addressUpdated =
          aiData.delivery_address && aiData.delivery_address !== draftOrder?.delivery_address;
        if (!user.latitude || !user.longitude) {
          return {
            reply: await makeReply(
              "ORDER_SUMMARY_NEED_LOCATION",
              buildUserContext({
                user,
                draftOrder: currentDraft,
                items: mergedItems,
                pickup: inferredPickup,
                address: finalAddress,
                notes: uniqueNotesList(combinedDraftNotes),
                flags: { needs_location: true, show_details: true },
                lastMessage: cleanText,
              }),
              [LOCATION_INSTRUCTION],
            ),
          };
        }

        if (currentDraft.status !== "PENDING_CONFIRMATION") {
          await currentDraft.update({ status: "PENDING_CONFIRMATION" });
        }

        return {
          reply: await makeReply(
            addressUpdated ? "ORDER_SUMMARY_ADDRESS_UPDATED" : "ORDER_SUMMARY",
            buildUserContext({
              user,
              draftOrder: currentDraft,
              items: mergedItems,
              pickup: inferredPickup,
              address: finalAddress,
              notes: uniqueNotesList(combinedDraftNotes),
              flags: {
                needs_confirmation: true,
                address_updated: addressUpdated,
                show_details: true,
              },
              lastMessage: cleanText,
            }),
          ),
        };
      }

      if (!hasItems)
        return {
          reply: await makeReply(
            "ASK_ITEMS",
            buildUserContext({
              user,
              draftOrder: currentDraft,
              items: mergedItems || [],
              pickup: inferredPickup || "",
              address: finalAddress || "",
              notes: uniqueNotesList(combinedDraftNotes),
              flags: { show_details: true },
              lastMessage: cleanText,
            }),
          ),
        };
      if (!hasPickup) {
        return {
          reply: await makeReply(
            "ASK_PICKUP",
            buildUserContext({
              user,
              draftOrder: currentDraft,
              items: mergedItems,
              pickup: inferredPickup || "",
              address: finalAddress || "",
              notes: uniqueNotesList(combinedDraftNotes),
              flags: { show_details: true },
              lastMessage: cleanText,
            }),
          ),
        };
      }
      return {
        reply: await makeReply(
          "ORDER_DRAFT_SUMMARY",
          buildUserContext({
            user,
            draftOrder: currentDraft,
            items: mergedItems,
            pickup: inferredPickup,
            address: finalAddress,
            notes: uniqueNotesList(combinedDraftNotes),
            flags: { show_details: true },
            lastMessage: cleanText,
          }),
        ),
      };
    }

    if (intent === "CHITCHAT") {
      const status = (isPolite(lowerText) || isGreeting(lowerText)) ? "CHITCHAT" : "OUT_OF_SCOPE";
      return {
        reply: await makeReply(
          status,
          buildUserContext({
            user,
            draftOrder,
            activeOrder,
            items: (activeOrder || draftOrder)?.items_summary || [],
            pickup: (activeOrder || draftOrder)?.pickup_address || "",
            address: (activeOrder || draftOrder)?.delivery_address || "",
            notes: uniqueNotesList((activeOrder || draftOrder)?.order_notes || []),
            lastMessage: cleanText,
          }),
        ),
      };
    }

    if (!finalReply) {
      finalReply = await makeReply(
        "GENERIC_HELP",
        buildUserContext({ user, lastMessage: cleanText }),
      );
    }

    await session.update({ last_interaction: new Date() });
    return { reply: finalReply };
  } catch (error) {
    console.error("❌ User Flow Error:", error);
    return {
      action: "handoff",
      reply:
        "Maaf kak, sistem kami sedang mengalami kendala. Percakapan ini kami alihkan ke admin (mode HUMAN) selama 30 menit ya. Mohon tunggu sebentar 🙏",
    };
  }
};