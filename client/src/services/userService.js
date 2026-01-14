import api from "./api";

export const userService = {
  // Get List dengan Params (page, search, role)
  getUsers: async (params) => {
    const response = await api.get("/admins", { params });
    return response.data;
  },

  // Create User Baru
  createUser: async (userData) => {
    const response = await api.post("/admins", userData);
    return response.data;
  },

  // Update User
  updateUser: async (id, userData) => {
    const response = await api.put(`/admins/${id}`, userData);
    return response.data;
  },

  // Delete User
  deleteUser: async (id) => {
    const response = await api.delete(`/admins/${id}`);
    return response.data;
  },
};
