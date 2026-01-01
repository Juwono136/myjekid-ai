import axios from "axios";

// Sesuaikan port backend Anda (5000)
const API_URL = "/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// --- INTERCEPTOR REQUEST (Tetap sama) ---
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

// --- INTERCEPTOR RESPONSE (PERBAIKAN DISINI) ---
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Cek apakah error ada responnya
    if (error.response) {
      // LOGIKA BARU:
      // Jika error 401 (Unauthorized)
      // DAN BUKAN berasal dari proses login (/auth/login)
      // Maka lakukan auto-logout.
      if (error.response.status === 401 && !error.config.url.includes("/auth/login")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login"; // Redirect hanya jika sesi expired, bukan salah password
      }
    }

    return Promise.reject(error);
  }
);

export default api;
