import api from "./api";

const interventionService = {
  // GET: Ambil daftar sesi chat aktif (Sidebar)
  getSessions: async (search = "") => {
    // Backend endpoint: /api/intervention/sessions?search=...
    const response = await api.get("/intervention/sessions", {
      params: { search },
    });
    return response.data; // { status: "success", data: [...] }
  },

  // GET: Ambil history chat user tertentu (Chat Window)
  getChatHistory: async (phone) => {
    // Backend endpoint: /api/intervention/history/:phone
    const response = await api.get(`/intervention/history/${phone}`);
    return response.data; // { status: "success", data: [...] }
  },

  // POST: Admin kirim pesan ke user
  sendMessage: async (phone, message) => {
    // Backend endpoint: /api/intervention/send
    const response = await api.post("/intervention/send", {
      phone,
      message,
    });
    return response.data;
  },

  // POST: Admin mengembalikan ke mode Bot (Resolve)
  resolveSession: async (phone) => {
    // Backend endpoint: /api/intervention/resolve
    const response = await api.post("/intervention/resolve", {
      phone,
    });
    return response.data;
  },

  // Fungsi Toggle Mode
  toggleMode: async (phone, mode) => {
    // Endpoint ini harus sesuai dengan route backend Anda
    return await api.post("/intervention/toggle-mode", { phone, mode });
  },
};

export default interventionService;
