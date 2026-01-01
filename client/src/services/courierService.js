import api from "./api";

export const courierService = {
  // Ambil list kurir dengan filter
  getCouriers: async (params) => {
    const response = await api.get("/couriers", { params });
    return response.data;
  },

  // Tambah kurir baru (Daftarkan No HP)
  createCourier: async (data) => {
    const response = await api.post("/couriers", data);
    return response.data;
  },

  // Update data kurir (Ganti Nama/Shift/Status Suspend)
  updateCourier: async (id, data) => {
    const response = await api.put(`/couriers/${id}`, data);
    return response.data;
  },

  // Hapus kurir
  deleteCourier: async (id) => {
    const response = await api.delete(`/couriers/${id}`);
    return response.data;
  },
};
