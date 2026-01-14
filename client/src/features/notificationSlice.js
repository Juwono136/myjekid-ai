import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import notificationService from "../services/notificationService";

export const fetchNotifications = createAsyncThunk(
  "notifications/fetch",
  async ({ page, limit, search, isLoadMore = false }, thunkAPI) => {
    try {
      const response = await notificationService.getNotifications(page, limit, search);
      return { ...response, isLoadMore };
    } catch (error) {
      return thunkAPI.rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const markNotificationAsRead = createAsyncThunk(
  "notifications/markRead",
  async (id, thunkAPI) => {
    await notificationService.markAsRead(id);
    return id;
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  "notifications/markAllRead",
  async (_, thunkAPI) => {
    await notificationService.markAllAsRead();
    return true;
  }
);

const notificationSlice = createSlice({
  name: "notifications",
  initialState: {
    items: [],
    unreadCount: 0,
    totalItems: 0,
    isLoading: false,
    hasMore: true,
  },
  reducers: {
    // Action untuk Socket.IO
    addRealtimeNotification: (state, action) => {
      state.items.unshift(action.payload);
      state.unreadCount += 1;
      state.totalItems += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.isLoading = false;
        const { data, isLoadMore } = action.payload;
        const newItems = data?.items || [];

        if (isLoadMore) {
          const uniqueItems = newItems.filter(
            (n) => !state.items.some((existing) => existing.id === n.id)
          );
          state.items = [...state.items, ...uniqueItems];
        } else {
          // Initial Load / Search: Replace data
          state.items = newItems;
        }

        state.totalItems = data?.totalItems || 0;
        state.unreadCount = data?.unreadCount || 0;
        state.hasMore = state.items.length < state.totalItems;
      })

      .addCase(markNotificationAsRead.pending, (state, action) => {
        const id = action.meta.arg;
        const item = state.items.find((i) => i.id === id);
        if (item && !item.is_read) {
          item.is_read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })

      .addCase(markAllNotificationsRead.pending, (state) => {
        state.items.forEach((i) => (i.is_read = true));
        state.unreadCount = 0;
      });
  },
});

export const { addRealtimeNotification } = notificationSlice.actions;
export default notificationSlice.reducer;
