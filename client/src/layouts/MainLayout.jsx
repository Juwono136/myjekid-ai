import { Outlet, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

const MainLayout = () => {
  const { token } = useSelector((state) => state.auth);

  // Proteksi Route: Jika tidak ada token, tendang ke login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="drawer lg:drawer-open bg-gray-50 min-h-screen">
      <input id="my-drawer-2" type="checkbox" className="drawer-toggle" />

      {/* AREA KONTEN UTAMA */}
      <div className="drawer-content flex flex-col">
        {/* Navbar nempel di atas konten */}
        <Navbar />

        {/* Area Page (Dashboard, Maps, dll akan di-render di sini) */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* AREA SIDEBAR */}
      <div className="drawer-side z-40">
        <label htmlFor="my-drawer-2" aria-label="close sidebar" className="drawer-overlay"></label>
        {/* Kirim fungsi closeDrawer kosong agar tidak error prop */}
        <Sidebar closeDrawer={() => (document.getElementById("my-drawer-2").checked = false)} />
      </div>
    </div>
  );
};

export default MainLayout;
