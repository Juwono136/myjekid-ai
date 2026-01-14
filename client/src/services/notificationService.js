import api from "./api";

const notificationService = {
  // Get notification data (Pagination & Search)
  getNotifications: async (page = 1, limit = 10, search = "") => {
    const response = await api.get("/notifications", {
      params: { page, limit, search },
    });
    return response.data;
  },

  // Mark Single Read
  markAsRead: async (id) => {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
  },

  // Mark All Read
  markAllAsRead: async () => {
    const response = await api.patch("/notifications/read-all");
    return response.data;
  },
};

export default notificationService;
