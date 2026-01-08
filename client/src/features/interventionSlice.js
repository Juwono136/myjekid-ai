import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import interventionService from "../services/interventionService";

// --- THUNKS ---

export const fetchSessions = createAsyncThunk(
  "intervention/fetchSessions",
  async (search, thunkAPI) => {
    try {
      const response = await interventionService.getSessions(search);
      return response.data; // Array sessions
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const fetchChatHistory = createAsyncThunk(
  "intervention/fetchHistory",
  async (phone, thunkAPI) => {
    try {
      const response = await interventionService.getChatHistory(phone);
      return response.data; // Array messages
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  "intervention/sendMessage",
  async ({ phone, message }, thunkAPI) => {
    try {
      return await interventionService.sendMessage(phone, message);
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const resolveSession = createAsyncThunk(
  "intervention/resolveSession",
  async (phone, thunkAPI) => {
    try {
      await interventionService.resolveSession(phone);
      return phone; // Return phone untuk update state lokal
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const toggleSessionMode = createAsyncThunk(
  "intervention/toggleMode",
  async ({ phone, mode }, thunkAPI) => {
    try {
      // Panggil endpoint baru di backend
      // Pastikan di interventionService.js sudah ada fungsi ini (lihat langkah 2 di bawah)
      const response = await interventionService.toggleMode(phone, mode);
      return { phone, mode, data: response.data };
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// --- SLICE ---

const initialState = {
  sessions: [],
  activeSession: null,
  messages: [],
  isLoadingSessions: false,
  isLoadingHistory: false,
  error: null,
};

const interventionSlice = createSlice({
  name: "intervention",
  initialState,
  reducers: {
    setActiveSession: (state, action) => {
      state.activeSession = action.payload;
      // Cari di list dan nol-kan badge
      const session = state.sessions.find((s) => s.phone === action.payload.phone);
      if (session) session.unreadCount = 0;
    },

    // --- [NEW] ACTION UNTUK SOCKET REALTIME ---
    addRealtimeMessage: (state, action) => {
      const newMessage = action.payload;

      // 1. Apakah Chat Window untuk user ini sedang terbuka?
      const isChatActive = state.activeSession && state.activeSession.phone === newMessage.phone;

      // UPDATE ACTIVE SESSION MESSAGES
      if (isChatActive) {
        state.messages.push(newMessage);
        // Jika mode berubah (misal dari BOT -> HUMAN), update state
        if (newMessage.mode) state.activeSession.mode = newMessage.mode;
      }

      // UPDATE SIDEBAR LIST
      const sessionIndex = state.sessions.findIndex((s) => s.phone === newMessage.phone);

      if (sessionIndex !== -1) {
        const session = state.sessions[sessionIndex];

        session.last_interaction = newMessage.timestamp;
        if (newMessage.mode) session.mode = newMessage.mode;

        // [FIX LOGIC BADGE]
        // Jika pesan dari USER dan chat SEDANG TIDAK AKTIF (User lain atau tertutup)
        if (newMessage.sender === "USER" && !isChatActive) {
          // Force convert to number agar aman
          const currentCount = typeof session.unreadCount === "number" ? session.unreadCount : 0;
          session.unreadCount = currentCount + 1;
        } else if (isChatActive) {
          // Jika chat aktif, reset jadi 0
          session.unreadCount = 0;
        }

        // Pindahkan ke atas
        state.sessions.splice(sessionIndex, 1);
        state.sessions.unshift(session);
      } else if (newMessage.sender === "USER") {
        // User Baru
        state.sessions.unshift({
          phone: newMessage.phone,
          user_name: newMessage.user_name || newMessage.phone,
          mode: newMessage.mode || "BOT",
          last_interaction: newMessage.timestamp,
          unreadCount: 1, // Init 1
        });
      }
    },
    // ------------------------------------------
  },
  extraReducers: (builder) => {
    builder
      // Fetch Sessions
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.isLoadingSessions = false;
        // Saat fetch ulang, pertahankan unreadCount lokal jika memungkinkan,
        // atau reset dari server. Di sini kita replace total.
        state.sessions = action.payload.map((s) => ({
          ...s,
          unreadCount: 0, // Default 0 karena backend belum support simpan unread status
        }));
      })
      .addCase(fetchSessions.pending, (state) => {
        state.isLoadingSessions = true;
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.isLoadingSessions = false;
        state.error = action.payload;
      })

      // Fetch History
      .addCase(fetchChatHistory.pending, (state) => {
        state.isLoadingHistory = true;
        state.messages = []; // Reset pesan lama saat loading baru
      })
      .addCase(fetchChatHistory.fulfilled, (state, action) => {
        state.isLoadingHistory = false;
        state.messages = action.payload;
      })
      .addCase(fetchChatHistory.rejected, (state, action) => {
        state.isLoadingHistory = false;
        state.error = action.payload;
      })

      // Send Message (Hanya handling loading state, pesan masuk via Socket)
      .addCase(sendMessage.pending, (state) => {
        state.isSending = true;
      })
      .addCase(sendMessage.fulfilled, (state) => {
        state.isSending = false;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isSending = false;
        state.error = action.payload;
      })

      // Resolve Session
      .addCase(resolveSession.fulfilled, (state, action) => {
        const phone = action.payload;
        // Update mode di list sessions jadi 'BOT'
        const session = state.sessions.find((s) => s.phone === phone);
        if (session) session.mode = "BOT";

        // Update mode di activeSession jika sama
        if (state.activeSession?.phone === phone) {
          state.activeSession.mode = "BOT";
        }
      })

      .addCase(toggleSessionMode.fulfilled, (state, action) => {
        const { phone, mode } = action.payload;

        // Update di Session List
        const session = state.sessions.find((s) => s.phone === phone);
        if (session) session.mode = mode;

        // Update di Active Session (jika sedang dibuka)
        if (state.activeSession?.phone === phone) {
          state.activeSession.mode = mode;
        }
      });
  },
});

export const { setActiveSession, addRealtimeMessage } = interventionSlice.actions;
export default interventionSlice.reducer;
