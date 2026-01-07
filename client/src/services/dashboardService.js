import api from "./api";

export const dashboardService = {
  // Stats Utama (Kartu & Recent Orders)
  getStats: async () => {
    const response = await api.get("/dashboard/stats");
    return response.data;
  },

  // Data Chart Spesifik (Independent)
  getChartData: async (type, range) => {
    const response = await api.get("/dashboard/chart", { params: { type, range } });
    return response.data;
  },
};
