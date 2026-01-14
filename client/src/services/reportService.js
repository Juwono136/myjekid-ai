import api from "./api";

const API_URL = "/reports";

const reportService = {
  // Get Summary Cards
  getSummary: async (params) => {
    const response = await api.get(`${API_URL}/summary`, { params });
    return response.data;
  },

  // Get Chart Data
  getChartData: async (params) => {
    const response = await api.get(`${API_URL}/chart`, { params });
    return response.data;
  },

  // Get Transactions List
  getTransactions: async (params) => {
    const response = await api.get(`${API_URL}/transactions`, { params });
    return response.data;
  },

  // Download Excel (BLOB Handling)
  downloadExcel: async (params) => {
    const response = await api.get(`${API_URL}/export/excel`, {
      params,
      responseType: "blob",
    });

    // Logic auto-download di browser
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;

    // Nama file default
    link.setAttribute("download", `Laporan_Transaksi_${Date.now()}.xlsx`);

    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
  },
};

export default reportService;
