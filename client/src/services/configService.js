import api from "./api";

export const configService = {
  getBaseCamp: async () => {
    const response = await api.get("/config/base-camp");
    return response.data;
  },
};
