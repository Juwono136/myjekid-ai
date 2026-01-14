import api from "./api";

export const authService = {
  // Update Profile (Nama & HP)
  updateProfile: async (userData) => {
    const response = await api.patch("/auth/profile", userData);
    return response.data;
  },

  // Update Password (Ganti Password)
  updatePassword: async (passwordData) => {
    const response = await api.patch("/auth/password", passwordData);
    return response.data;
  },
};
