import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import orderService from "../services/orderService";

const initialState = {
  orders: [],
  pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
  orderDetail: null,
  isDetailLoading: false,
  isLoading: false,
  isError: false,
  message: "",
};

// Fetch List Orders
export const fetchOrders = createAsyncThunk("orders/fetchAll", async (params, thunkAPI) => {
  try {
    return await orderService.getAll(params);
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    return thunkAPI.rejectWithValue(msg);
  }
});

// Fetch Order Detail (New)
export const fetchOrderDetail = createAsyncThunk(
  "orders/fetchDetail",
  async (orderId, thunkAPI) => {
    try {
      return await orderService.getById(orderId);
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(msg);
    }
  }
);

// Update Order Detail (Admin/CS)
export const updateOrderDetail = createAsyncThunk(
  "orders/updateDetail",
  async ({ orderId, payload }, thunkAPI) => {
    try {
      return await orderService.updateOrder(orderId, payload);
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(msg);
    }
  }
);

const orderSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    // Reset data detail saat modal ditutup agar tidak flashing data lama
    clearOrderDetail: (state) => {
      state.orderDetail = null;
      state.isDetailLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.isLoading = true;
        state.isError = false;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders = action.payload.data;
        state.pagination = action.payload.meta || action.payload.pagination;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload;
      })

      .addCase(fetchOrderDetail.pending, (state) => {
        state.isDetailLoading = true;
        state.isError = false;
      })
      .addCase(fetchOrderDetail.fulfilled, (state, action) => {
        state.isDetailLoading = false;
        state.orderDetail = action.payload.data;
      })
      .addCase(fetchOrderDetail.rejected, (state, action) => {
        state.isDetailLoading = false;
        state.isError = true;
        state.message = action.payload;
      });

    builder
      .addCase(updateOrderDetail.pending, (state) => {
        state.isDetailLoading = true;
        state.isError = false;
      })
      .addCase(updateOrderDetail.fulfilled, (state, action) => {
        state.isDetailLoading = false;
        state.orderDetail = action.payload.data;
      })
      .addCase(updateOrderDetail.rejected, (state, action) => {
        state.isDetailLoading = false;
        state.isError = true;
        state.message = action.payload;
      });
  },
});

export const { clearOrderDetail } = orderSlice.actions;
export default orderSlice.reducer;
