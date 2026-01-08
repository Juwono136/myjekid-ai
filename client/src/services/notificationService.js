import api from "./api";

const notificationService = {
  // GET: Ambil notifikasi (Pagination, Search, Filter Date)
  getAll: async (params) => {
    // params: { page, limit, search, startDate, endDate }
    const response = await api.get("/notifications", { params });
    return response.data; // { status: "success", data: { items, unreadCount, ... } }
  },

  // PUT: Tandai sudah dibaca
  markAsRead: async (id) => {
    const response = await api.put(`/notifications/${id}/read`);
    return response.data;
  },
};

export default notificationService;
