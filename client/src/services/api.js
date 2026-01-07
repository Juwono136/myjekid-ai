import axios from "axios";

// Sesuaikan port backend Anda (5000)
const API_URL = "/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// --- INTERCEPTOR REQUEST ---
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- INTERCEPTOR RESPONSE (PERBAIKAN UTAMA) ---
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 1. Cek apakah ada response dari server
    if (error.response) {
      const { status } = error.response;

      // 2. Cek Status 401 (Unauthorized) atau 403 (Forbidden)
      // Pastikan error bukan berasal dari halaman login (salah password)
      if ((status === 401 || status === 403) && !error.config.url.includes("/auth/login")) {
        console.warn("[Auth] Sesi habis atau tidak valid. Melakukan logout...");

        // A. Hapus data sesi
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        // B. Redirect paksa ke halaman login
        // Menggunakan window.location agar state Redux & React bersih total
        window.location.href = "/login";

        // C. Jangan reject promise agar UI tidak sempat merender pesan error "Network Error"
        // Kita return promise yang tidak pernah selesai (pending) sampai halaman reload.
        return new Promise(() => {});
      }
    } else {
      // Handle jika server mati atau tidak ada koneksi internet
      console.error("Network Error / Server Down");
    }

    return Promise.reject(error);
  }
);

export default api;
