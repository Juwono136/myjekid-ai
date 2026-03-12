/**
 * Nomor yang dianggap bot/operator/chatbot — pesan dari nomor ini tidak dibalas.
 * Contoh: nomor operator seluler dari MyJek (+628551000185).
 */
const BLOCKLIST_RAW = (process.env.CHATBOT_BLOCKLIST_PHONES || "628551000185")
  .split(",")
  .map((s) => s.trim().replace(/\D/g, ""))
  .filter(Boolean);

const BLOCKLIST_SET = new Set(
  BLOCKLIST_RAW.flatMap((digits) => {
    const normalized = digits.startsWith("62") ? digits : `62${digits}`;
    return [normalized, digits, normalized.replace(/^62/, "0")];
  })
);

/**
 * Cek apakah nomor (JID atau nomor saja) termasuk blocklist — jangan balas.
 */
export function isBlockedPhone(phoneOrJid) {
  if (!phoneOrJid || typeof phoneOrJid !== "string") return false;
  const s = String(phoneOrJid).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10) return false;
  const as62 = digits.startsWith("62") ? digits : digits.startsWith("0") ? "62" + digits.slice(1) : "62" + digits;
  return BLOCKLIST_SET.has(as62) || BLOCKLIST_SET.has(digits);
}
