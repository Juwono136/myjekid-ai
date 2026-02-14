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

  // Kurir eligible untuk order (idle, shift aktif, terdekat ke lokasi pickup)
  getEligibleCouriers: async (orderId) => {
    const response = await api.get(`/orders/${orderId}/eligible-couriers`);
    return response.data;
  },

  // Update order detail (Admin/CS)
  updateOrder: async (orderId, payload) => {
    const response = await api.put(`/orders/${orderId}`, payload);
    return response.data;
  },

  // Batalkan order (Admin/CS) — hanya untuk status DRAFT, PENDING_CONFIRMATION, LOOKING_FOR_DRIVER. Pelanggan dapat notif WA.
  cancelOrder: async (orderId) => {
    const response = await api.patch(`/orders/${orderId}/cancel`);
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
