export const formatSummaryReply = (name, items, pickup, address, notes = []) => {
  // Jika items kosong/undefined, berikan array kosong
  const validItems = Array.isArray(items) ? items : [];

  let itemList = validItems
    .map((i) => `- ${i.item || "Menu"} (x${i.qty || 1})${i.note ? ` - ${i.note}` : ""}`)
    .join("\n");

  const pickupText = pickup || "_Belum ditentukan_";
  const addressText = address || "_Belum ditentukan_";

  const noteLines = Array.isArray(notes)
    ? notes
        .map((n) => (typeof n === "string" ? n : n?.note))
        .filter(Boolean)
        .map((n) => `- ${n}`)
        .join("\n")
    : "";

  const noteSection = noteLines ? `\n\nCatatan:\n${noteLines}` : "";

  return `Siap kak ${name} 😊
Pesanan sudah lengkap dan siap diproses ya 👍

📦 *Detail Pesanan:*
${itemList || "- _Belum ada menu_"}

📍 *Antar ke:* ${addressText}
📍 *Pickup dari:* ${pickupText}${noteSection}

Mohon konfirmasi dulu pesanannya kak apakah sudah sesuai? 🙏`;
};

export const getStatusMessage = (status) => {
  switch (status) {
    case "LOOKING_FOR_DRIVER":
      return "sedang dicarikan kurir";
    case "ON_PROCESS":
      return "sedang dalam perjalanan pengantaran";
    case "BILL_VALIDATION":
      return "sedang dalam proses validasi tagihan";
    case "BILL_SENT":
      return "tagihan sudah dikirim, mohon dicek ya";
    case "COMPLETED":
      return "sudah selesai diantar";
    case "CANCELLED":
      return "sudah dibatalkan";
    default:
      return "sedang diproses";
  }
};

export const sanitizePhoneNumber = (rawInput) => {
  if (!rawInput) return null;

  // Buang semua karakter selain angka (spasi, strip, huruf, dll)
  let clean = rawInput.toString().replace(/[^0-9]/g, "");

  // Jika diawali '08', ganti jadi '628'
  if (clean.startsWith("08")) {
    clean = "62" + clean.slice(1);
  }
  // Jika diawali '8', tambah '62' (kasus user ngetik 812...)
  else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }

  // Validasi panjang (Minimal 10 digit, Maksimal 15)
  if (clean.length < 10 || clean.length > 15) {
    return null; // Nomor tidak valid
  }

  return clean; // Output: 628123456789
};
