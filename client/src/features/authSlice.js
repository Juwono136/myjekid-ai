import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../services/api";
import { authService } from "../services/authService";

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/login", credentials);
      return response.data;
    } catch (error) {
      if (error.response && error.response.data) {
        return rejectWithValue(error.response.data);
      } else {
        return rejectWithValue({ message: "Gagal terhubung ke server (Network Error)" });
      }
    }
  }
);

// Update Profile
export const updateProfile = createAsyncThunk("auth/updateProfile", async (userData, thunkAPI) => {
  try {
    return await authService.updateProfile(userData);
  } catch (error) {
    const message =
      (error.response && error.response.data && error.response.data.message) ||
      error.message ||
      error.toString();
    return thunkAPI.rejectWithValue(message);
  }
});

// Update Password
export const updatePassword = createAsyncThunk(
  "auth/updatePassword",
  async (passwordData, thunkAPI) => {
    try {
      return await authService.updatePassword(passwordData);
    } catch (error) {
      const message =
        (error.response && error.response.data && error.response.data.message) ||
        error.message ||
        error.toString();
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Jangan lupa export default reducer
const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: JSON.parse(localStorage.getItem("user")) || null,
    token: localStorage.getItem("token") || null,
    loading: false,
    error: false,
    success: false,
  },
  reducers: {
    reset: (state) => {
      state.loading = false;
      state.success = false;
      state.error = false;
      state.message = "";
    },
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
      })

      .addCase(updateProfile.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = false;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;

        const updatedUserData = action.payload.data || action.payload;

        if (state.user) {
          // Merge data lama dengan yang baru
          state.user = { ...state.user, ...updatedUserData };

          // UPDATE LOCAL STORAGE AGAR PERSISTENT SAAT REFRESH
          localStorage.setItem("user", JSON.stringify(state.user));
        }
        state.message = "Profil berhasil diperbarui.";
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = true;
        state.message = action.payload;
      })

      .addCase(updatePassword.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = false;
      })
      .addCase(updatePassword.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.message = action.payload.message || "Password berhasil diubah.";
      })
      .addCase(updatePassword.rejected, (state, action) => {
        state.loading = false;
        state.error = true;
        state.message = action.payload;
      });
  },
});

export const { logout, reset } = authSlice.actions;
export default authSlice.reducer;
