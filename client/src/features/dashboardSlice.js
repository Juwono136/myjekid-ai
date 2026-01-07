import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { dashboardService } from "../services/dashboardService";

const initialState = {
  stats: {},
  charts: {
    revenue: [],
    distribution: [],
  },
  recentOrders: [],
  isError: false,
  isSuccess: false,
  isLoading: false,
  message: "",
};

// Async Thunk
export const getDashboardStats = createAsyncThunk("dashboard/getStats", async (range, thunkAPI) => {
  // Perhatikan parameter 'range' disini
  try {
    return await dashboardService.getStats(range);
  } catch (error) {
    const message =
      (error.response && error.response.data && error.response.data.message) ||
      error.message ||
      error.toString();
    return thunkAPI.rejectWithValue(message);
  }
});

export const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = false;
      state.isSuccess = false;
      state.isError = false;
      state.message = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getDashboardStats.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getDashboardStats.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isSuccess = true;

        // --- DEBUGGING LOG (Cek Console Browser saat refresh) ---
        console.log("📦 [REDUX] Payload diterima:", action.payload);

        // --- MAPPING DATA (PERBAIKAN UTAMA DISINI) ---
        // Backend mengirim: { status: "success", data: { stats, charts, recentOrders } }
        // Jadi kita akses via action.payload.data

        if (action.payload && action.payload.data) {
          state.stats = action.payload.data.stats;

          // Pastikan charts ada isinya, jika tidak fallback ke default
          state.charts = action.payload.data.charts || { revenue: [], distribution: [] };

          state.recentOrders = action.payload.data.recentOrders || [];
        }
      })
      .addCase(getDashboardStats.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload;
      });
  },
});

export const { reset } = dashboardSlice.actions;
export default dashboardSlice.reducer;
