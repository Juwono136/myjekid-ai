import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./App.css";

// Pages & Layouts
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import DashboardHome from "./pages/DashboardHome";
import UserManagement from "./pages/UserManagement";
import RoleBasedRoute from "./components/RoleBasedRoute";
import Settings from "./pages/Settings";
import CourierManagement from "./pages/CourierManagement";
import LiveMap from "./pages/LiveMap";
import ProtectedRoute from "./components/ProtectedRoute";
import OrderMonitor from "./pages/OrderMonitor";

// Placeholder Pages (Untuk Menu Lain yang belum dibuat)
const PlaceholderPage = ({ title }) => (
  <div className="p-10 text-center bg-white rounded-2xl shadow-sm border border-gray-100 h-full">
    <h2 className="text-2xl font-bold text-gray-400">{title}</h2>
    <p className="text-gray-400">Fitur ini sedang dalam pengembangan.</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      {/* Toast Notification Config */}
      <Toaster
        toastOptions={{
          style: { borderRadius: "10px", background: "#333", color: "#fff" },
          duration: 5000,
        }}
      />

      <Routes>
        {/* PUBLIC ROUTE */}
        <Route path="/login" element={<Login />} />

        {/* PROTECTED ROUTES (DASHBOARD) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<MainLayout />}>
            <Route index element={<DashboardHome />} />

            <Route path="map" element={<LiveMap />} />
            <Route path="orders" element={<OrderMonitor />} />
            <Route path="chat" element={<PlaceholderPage title="Intervention Chat" />} />
            <Route path="reports" element={<PlaceholderPage title="Laporan Transaksi" />} />
            <Route path="couriers" element={<CourierManagement />} />

            {/* Role Based Route tetap digunakan di dalam sini untuk proteksi spesifik */}
            <Route
              path="users"
              element={
                <RoleBasedRoute allowedRoles={["SUPER_ADMIN"]}>
                  <UserManagement />
                </RoleBasedRoute>
              }
            />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        {/* DEFAULT REDIRECT */}
        <Route
          path="*"
          element={
            <Navigate to={localStorage.getItem("token") ? "/dashboard" : "/login"} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
