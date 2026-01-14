import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { courierService } from "../services/courierService";

// Fetch Couriers (dengan filter & pagination)
export const fetchCouriers = createAsyncThunk("courier/fetchCouriers", async (params, thunkAPI) => {
  try {
    return await courierService.getCouriers(params);
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    return thunkAPI.rejectWithValue(message);
  }
});

// Create Courier
export const createCourier = createAsyncThunk("courier/createCourier", async (data, thunkAPI) => {
  try {
    return await courierService.createCourier(data);
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    return thunkAPI.rejectWithValue(message);
  }
});

// Update Courier
export const updateCourier = createAsyncThunk(
  "courier/updateCourier",
  async ({ id, data }, thunkAPI) => {
    try {
      return await courierService.updateCourier(id, data);
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Delete Courier
export const deleteCourier = createAsyncThunk("courier/deleteCourier", async (id, thunkAPI) => {
  try {
    await courierService.deleteCourier(id);
    return id; // Return ID yang dihapus untuk update state lokal
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    return thunkAPI.rejectWithValue(message);
  }
});

const courierSlice = createSlice({
  name: "courier",
  initialState: {
    couriers: [],
    meta: { totalPages: 1, totalItems: 0, currentPage: 1 },
    isLoading: false,
    isSuccess: false,
    isError: false,
    message: "",
  },
  reducers: {
    resetState: (state) => {
      state.isLoading = false;
      state.isSuccess = false;
      state.isError = false;
      state.message = "";
    },
  },
  extraReducers: (builder) => {
    builder
      // FETCH
      .addCase(fetchCouriers.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchCouriers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isSuccess = true;
        state.couriers = action.payload.data;
        state.meta = action.payload.meta;
      })
      .addCase(fetchCouriers.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload;
      })

      // CREATE
      .addCase(createCourier.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(createCourier.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isSuccess = true;
      })
      .addCase(createCourier.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload;
      })

      .addCase(updateCourier.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(updateCourier.fulfilled, (state) => {
        state.isLoading = false;
        state.isSuccess = true;
      })
      .addCase(updateCourier.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload;
      })

      .addCase(deleteCourier.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isSuccess = true;
        state.couriers = state.couriers.filter((c) => c.id !== action.payload);
      });
  },
});

export const { resetState } = courierSlice.actions;
export default courierSlice.reducer;
