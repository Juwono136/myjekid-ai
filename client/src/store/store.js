import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/authSlice";
import courierReducer from "../features/courierSlice";
import dashboardReducer from "../features/dashboardSlice";
import orderReducer from "../features/orderSlice";
import interventionReducer from "../features/interventionSlice";
import notificationReducer from "../features/notificationSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    courier: courierReducer,
    dashboard: dashboardReducer,
    orders: orderReducer,
    intervention: interventionReducer,
    notifications: notificationReducer,
  },
});
