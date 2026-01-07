import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/authSlice";
import courierReducer from "../features/courierSlice";
import dashboardReducer from "../features/dashboardSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    courier: courierReducer,
    dashboard: dashboardReducer,
  },
});
