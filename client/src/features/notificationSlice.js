import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import notificationService from "../services/notificationService";

export const fetchNotifications = createAsyncThunk(
  "notifications/fetchAll",
  async (params, thunkAPI) => {
    try {
      // params: { page, limit, search, startDate, endDate }
      const response = await notificationService.getAll(params);
      return {
        data: response.data,
        isLoadMore: params.page > 1, // Flag untuk menentukan replace atau append
      };
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const markNotifRead = createAsyncThunk("notifications/markRead", async (id, thunkAPI) => {
  try {
    await notificationService.markAsRead(id);
    return id;
  } catch (error) {
    return thunkAPI.rejectWithValue(error.message);
  }
});

const initialState = {
  items: [],
  unreadCount: 0,
  currentPage: 1,
  totalPages: 1,
  isLoading: false,
  error: null,
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    // Action untuk Socket.io: Notifikasi baru masuk
    addRealtimeNotification: (state, action) => {
      state.items.unshift(action.payload); // Tambah di paling atas
      state.unreadCount += 1;
    },
    // Reset list saat search/filter berubah (agar lazy load mulai dari awal)
    resetNotifications: (state) => {
      state.items = [];
      state.currentPage = 1;
      state.totalPages = 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.isLoading = false;
        const { items, unreadCount, currentPage, totalPages } = action.payload.data;
        const isLoadMore = action.payload.isLoadMore;

        if (isLoadMore) {
          // Lazy Load: Gabungkan data lama + baru
          state.items = [...state.items, ...items];
        } else {
          // First Load / Filter: Timpa data
          state.items = items;
        }

        state.unreadCount = unreadCount;
        state.currentPage = currentPage;
        state.totalPages = totalPages;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      .addCase(markNotifRead.fulfilled, (state, action) => {
        const id = action.payload;
        const item = state.items.find((n) => n.id === id);
        if (item && !item.is_read) {
          item.is_read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      });
  },
});

export const { addRealtimeNotification, resetNotifications } = notificationSlice.actions;
export default notificationSlice.reducer;
