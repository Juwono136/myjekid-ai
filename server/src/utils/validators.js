/**
 * Validasi Format Email
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validasi Password Strength
 * Aturan: Minimal 8 Karakter, Ada Huruf Besar, Ada Huruf Kecil, Ada Angka.
 */
export const validatePassword = (password) => {
  const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
  return passwordRegex.test(password);
};
