// Validasi Format Email
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validasi Password Strength
// Aturan: Minimal 8 Karakter, Ada Huruf Besar, Ada Huruf Kecil, Ada Angka.
export const validatePassword = (password) => {
  const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Normalisasi + Validasi Nomor HP Indonesia
 * Output:
 * - "62xxxxxxxxxx" jika valid
 * - null jika tidak valid
 */
export const validateAndNormalizePhoneNumber = (phone) => {
  if (!phone) return null;

  // Hilangkan spasi
  let value = phone.replace(/\s+/g, "");

  // Tolak format +62
  if (value.startsWith("+")) {
    return null;
  }

  // Normalisasi 08 → 62
  if (value.startsWith("08")) {
    value = "62" + value.slice(1);
  }

  // Validasi akhir (format 62xxxxxxxxxx)
  const phoneRegex = /^62[89][0-9]{7,15}$/;

  return phoneRegex.test(value) ? value : null;
};
