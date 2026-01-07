import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

const RoleBasedRoute = ({ children, allowedRoles }) => {
  const { user } = useSelector((state) => state.auth);

  // 1. Jika User State Kosong (misal refresh halaman dan Redux belum siap),
  // Cek token fisik. Jika token tidak ada, ke login.
  if (!user) {
    const token = localStorage.getItem("token");
    if (!token) return <Navigate to="/login" replace />;

    // Jika token ada tapi user redux null (sedang loading profile),
    // idealnya return <Loader /> atau biarkan (karena ProtectedRoute sudah menangani)
    return null;
  }

  // 2. Jika Role tidak sesuai
  if (!allowedRoles.includes(user.role)) {
    // Redirect ke Dashboard Home, bukan Login (karena dia sudah login, cuma salah kamar)
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default RoleBasedRoute;
