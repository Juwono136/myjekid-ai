import api from "./api";

const orderService = {
  // Ambil semua list order dengan filter/search
  getAll: async (params) => {
    // params: page, limit, search, status, sortBy, sortOrder
    const response = await api.get("/orders", { params });
    return response.data;
  },

  // Ambil detail satu order (Untuk Modal)
  getById: async (orderId) => {
    const response = await api.get(`/orders/${orderId}`);
    return response.data;
  },

  // Update order detail (Admin/CS)
  updateOrder: async (orderId, payload) => {
    const response = await api.put(`/orders/${orderId}`, payload);
    return response.data;
  },

  // Daftar pelanggan untuk dropdown (Tambah Order by Admin)
  getCustomers: async () => {
    const response = await api.get("/orders/customers");
    return response.data;
  },

  // Buat order oleh admin (status LOOKING_FOR_DRIVER, notif ke customer & kurir)
  createOrderByAdmin: async (payload) => {
    const response = await api.post("/orders/by-admin", payload);
    return response.data;
  },
};

export default orderService;
