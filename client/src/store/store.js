import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/authSlice";
import courierReducer from "../features/courierSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    courier: courierReducer,
  },
});
