import api from "./api";

const interventionService = {
  // Ambil daftar sesi chat aktif (Sidebar)
  getSessions: async (search = "") => {
    const response = await api.get("/intervention/sessions", {
      params: { search },
    });
    return response.data;
  },

  // Ambil history chat user tertentu (Chat Window)
  getChatHistory: async (phone) => {
    const response = await api.get(`/intervention/history/${phone}`);
    return response.data;
  },

  // Admin kirim pesan ke user
  sendMessage: async (phone, message) => {
    const response = await api.post("/intervention/send", {
      phone,
      message,
    });
    return response.data;
  },

  // Admin mengembalikan ke mode Bot (Resolve)
  resolveSession: async (phone) => {
    const response = await api.post("/intervention/resolve", {
      phone,
    });
    return response.data;
  },

  // Fungsi Toggle Mode
  toggleMode: async (phone, mode) => {
    return await api.post("/intervention/toggle-mode", { phone, mode });
  },
};

export default interventionService;
