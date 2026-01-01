import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

const RoleBasedRoute = ({ children, allowedRoles }) => {
  const { user } = useSelector((state) => state.auth);

  // Jika user tidak ada (belum login) atau role tidak sesuai
  if (!user || !allowedRoles.includes(user.role)) {
    // Redirect paksa ke Dashboard umum
    return <Navigate to="/dashboard" replace />;
  }

  // Jika aman, render halaman
  return children;
};

export default RoleBasedRoute;
