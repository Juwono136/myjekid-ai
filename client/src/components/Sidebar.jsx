import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FiHome,
  FiMap,
  FiShoppingBag,
  FiMessageSquare,
  FiFileText,
  FiSettings,
  FiLogOut,
  FiUsers,
  FiTruck,
} from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../features/authSlice";
import ConfirmationModal from "./ConfirmationModal";

const Sidebar = ({ closeDrawer }) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

  const handleLogoutConfirm = () => {
    dispatch(logout());
    setLogoutModalOpen(false);
    window.location.href = "/login";
  };

  const menus = [
    { name: "Overview", path: "/dashboard", icon: <FiHome size={20} />, exact: true },
    { name: "Mitra Kurir", path: "/dashboard/couriers", icon: <FiTruck size={20} /> },
    { name: "Live Map Kurir", path: "/dashboard/map", icon: <FiMap size={20} /> },
    { name: "Order Monitor", path: "/dashboard/orders", icon: <FiShoppingBag size={20} /> },
    { name: "Intervention Mode", path: "/dashboard/chat", icon: <FiMessageSquare size={20} /> },
    { name: "Laporan Transaksi", path: "/dashboard/reports", icon: <FiFileText size={20} /> },
    { name: "Pengaturan", path: "/dashboard/settings", icon: <FiSettings size={20} /> },
  ];

  // Insert User Management Menu untuk Super Admin
  const finalMenus = [...menus];
  if (user?.role === "SUPER_ADMIN") {
    // Remove '|| true' later in production
    finalMenus.splice(5, 0, {
      name: "User Management",
      path: "/dashboard/users",
      icon: <FiUsers size={20} />,
    });
  }

  return (
    <>
      <div className="bg-white text-base-content h-full min-h-screen w-72 border-r border-gray-100 flex flex-col shadow-xl lg:shadow-none">
        {/* HEADER BRAND */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-gray-50">
          <div className="w-10 h-10 bg-linear-to-r from-[#c73d06] to-[#f1b206] text-white rounded-xl flex items-center justify-center shadow-md">
            <span className="font-black text-xl">M</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 tracking-tight leading-none">
              MyJek Admin
            </h1>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mt-1">
              Smart Dashboard
            </p>
          </div>
        </div>

        {/* MENU LIST */}
        <div className="flex-1 overflow-y-auto py-6 px-4 custom-scrollbar">
          <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Main Menu
          </p>
          <ul className="space-y-1">
            {finalMenus.map((menu) => (
              <li key={menu.path}>
                <NavLink
                  to={menu.path}
                  end={menu.exact}
                  onClick={closeDrawer}
                  // PERBAIKAN CLASSNAME UTAMA:
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${
                      isActive
                        ? "bg-linear-to-r from-[#f14c06] to-[#d14306] text-white shadow-md shadow-orange-200 translate-x-1"
                        : "text-gray-500 hover:bg-orange-50 hover:text-[#d14306]"
                    }`
                  }
                >
                  {/* PERBAIKAN: Gunakan Render Prop Function untuk Children agar aman */}
                  {({ isActive }) => (
                    <>
                      {/* Icon Color Logic dipindah ke sini dengan string murni */}
                      <span className={isActive ? "text-white" : "text-gray-400"}>{menu.icon}</span>
                      <span>{menu.name}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* FOOTER LOGOUT */}
        <div className="p-4 border-t border-gray-50 bg-gray-50/50">
          <button
            onClick={() => setLogoutModalOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all font-medium text-sm group"
          >
            <FiLogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            Keluar Aplikasi
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isLogoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
        title="Konfirmasi Logout"
        message="Apakah Anda yakin ingin keluar dari sesi ini?"
        type="danger"
        confirmText="Ya, Keluar"
      />
    </>
  );
};

export default Sidebar;
