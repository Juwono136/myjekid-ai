import { Navigate, Outlet } from "react-router-dom";

const ProtectedRoute = () => {
  // Cek token dari LocalStorage (Sumber kebenaran utama untuk session persisten)
  const token = localStorage.getItem("token");

  // Jika tidak ada token, langsung arahkan ke Login
  // 'replace' digunakan agar user tidak bisa klik 'Back' kembali ke dashboard
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Jika ada token, izinkan render komponen anak (MainLayout/Dashboard)
  return <Outlet />;
};

export default ProtectedRoute;
