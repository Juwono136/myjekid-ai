import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import reportService from "../services/reportService";
import { startOfMonth, endOfMonth, format } from "date-fns";

// --- THUNKS (Tidak berubah banyak, logic parsing ada di sini) ---

export const fetchDashboardData = createAsyncThunk(
  "reports/fetchAll",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().reports;
      // Pastikan filters.startDate adalah string, jika null pakai default
      const startDate = filters.startDate ? filters.startDate : new Date().toISOString();
      const endDate = filters.endDate ? filters.endDate : new Date().toISOString();

      const params = {
        startDate: format(new Date(startDate), "yyyy-MM-dd"),
        endDate: format(new Date(endDate), "yyyy-MM-dd"),
      };

      const [summary, chart] = await Promise.all([
        reportService.getSummary(params),
        reportService.getChartData(params),
      ]);

      return { summary: summary.data, chart: chart.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Gagal memuat data");
    }
  }
);

export const fetchTransactions = createAsyncThunk(
  "reports/fetchTransactions",
  async (page = 1, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().reports;
      // Safety check for dates
      if (!filters.startDate || !filters.endDate) return rejectWithValue("Tanggal belum dipilih");

      const params = {
        page,
        limit: 10,
        startDate: format(new Date(filters.startDate), "yyyy-MM-dd"),
        endDate: format(new Date(filters.endDate), "yyyy-MM-dd"),
        search: filters.search,
      };
      const response = await reportService.getTransactions(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message);
    }
  }
);

export const downloadReportExcel = createAsyncThunk(
  "reports/downloadExcel",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().reports;
      const params = {
        startDate: format(new Date(filters.startDate), "yyyy-MM-dd"),
        endDate: format(new Date(filters.endDate), "yyyy-MM-dd"),
      };
      await reportService.downloadExcel(params);
    } catch (error) {
      return rejectWithValue("Gagal download Excel");
    }
  }
);

// --- SLICE (Perbaikan Initial State) ---

const initialState = {
  filters: {
    // SIMPAN SEBAGAI STRING ISO!
    startDate: startOfMonth(new Date()).toISOString(),
    endDate: endOfMonth(new Date()).toISOString(),
    search: "",
  },
  summary: {
    totalRevenue: 0,
    totalTransactions: 0,
    totalCancelled: 0,
    avgOrderValue: 0,
  },
  chartData: [],
  transactions: {
    items: [],
    totalPages: 1,
    currentPage: 1,
    totalItems: 0,
  },
  isLoading: false,
  isDownloading: false,
  error: null,
};

const reportSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    setFilters: (state, action) => {
      // Merge filter baru dengan yang lama
      state.filters = { ...state.filters, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardData.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.summary = action.payload.summary;
        state.chartData = action.payload.chart;
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.transactions = action.payload;
      })
      .addCase(downloadReportExcel.pending, (state) => {
        state.isDownloading = true;
      })
      .addCase(downloadReportExcel.fulfilled, (state) => {
        state.isDownloading = false;
      })
      .addCase(downloadReportExcel.rejected, (state) => {
        state.isDownloading = false;
      });
  },
});

export const { setFilters } = reportSlice.actions;
export default reportSlice.reducer;
