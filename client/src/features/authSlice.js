import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../services/api";

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/login", credentials);
      return response.data;
    } catch (error) {
      // PERBAIKAN: Tangkap data error dengan aman
      if (error.response && error.response.data) {
        // Mengembalikan seluruh object error dari backend ({ status, message })
        return rejectWithValue(error.response.data);
      } else {
        return rejectWithValue({ message: "Gagal terhubung ke server (Network Error)" });
      }
    }
  }
);

// ... (Sisa kode slice sama seperti sebelumnya) ...
// Pastikan extraReducers bagian rejected:
/*
.addCase(loginUser.rejected, (state, action) => {
    state.loading = false;
    state.error = action.payload?.message || "Login Gagal";
});
*/

// Jangan lupa export default reducer
const authSlice = createSlice({
  // ... config slice ...
  name: "auth",
  initialState: {
    user: JSON.parse(localStorage.getItem("user")) || null,
    token: localStorage.getItem("token") || null,
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      state.user = null;
      state.token = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.data;
        state.token = action.payload.token;
        localStorage.setItem("user", JSON.stringify(action.payload.data));
        localStorage.setItem("token", action.payload.token);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || "Login Gagal";
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
