import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { FiMenu, FiBell, FiSearch, FiSettings, FiLogOut, FiChevronDown } from "react-icons/fi";
import { logout } from "../features/authSlice";
import Breadcrumbs from "./Breadcrumbs";
import ConfirmationModal from "./ConfirmationModal";

const Navbar = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

  const handleLogoutConfirm = () => {
    dispatch(logout());
    setLogoutModalOpen(false);
    window.location.href = "/login";
  };

  // Helper untuk inisial nama
  const getInitials = (name) => {
    if (!name) return "A";
    return name.charAt(0).toUpperCase();
  };

  return (
    <>
      <div className="navbar bg-white/90 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 px-4 h-16 transition-all duration-300">
        {/* =======================
            BAGIAN KIRI
        ======================== */}
        <div className="flex-1 flex items-center gap-3">
          {/* Tombol Hamburger (Hanya Muncul di Layar < Large) */}
          <label
            htmlFor="my-drawer-2"
            className="btn btn-square btn-ghost btn-sm lg:hidden text-orange-800 hover:text-[#f14c06] hover:bg-orange-50 transition-colors"
          >
            <FiMenu size={24} />
          </label>

          {/* Breadcrumbs (Desktop) / Page Title (Mobile) */}
          <div className="flex flex-col justify-center">
            {/* Di Mobile tampilkan teks simpel, di Desktop tampilkan Breadcrumbs */}
            <div className="lg:hidden font-bold text-gray-700 text-sm">MyJek Admin</div>
            <div className="hidden lg:block">
              <Breadcrumbs />
            </div>
          </div>
        </div>

        {/* =======================
            BAGIAN KANAN
        ======================== */}
        <div className="flex-none flex items-center gap-2 md:gap-4">
          {/* Search Bar (Hidden di Mobile Kecil) */}
          <div className="hidden md:flex items-center bg-gray-50 hover:bg-gray-100 transition-colors rounded-full px-4 py-2 w-64 border border-transparent focus-within:border-[#f14c06]/30 focus-within:bg-white focus-within:shadow-sm">
            <FiSearch className="text-gray-400" />
            <input
              type="text"
              placeholder="Cari Order / Kurir..."
              className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-full text-gray-700 placeholder-gray-400 outline-none"
            />
          </div>

          {/* Tombol Notifikasi */}
          <button className="btn btn-ghost btn-circle btn-sm text-gray-500 hover:text-[#f14c06] hover:bg-orange-50 relative">
            <FiBell size={20} />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#f14c06] border-2 border-white rounded-full"></span>
          </button>

          {/* Divider Tipis */}
          <div className="h-8 w-px bg-gray-200 mx-1 hidden md:block"></div>

          {/* PROFIL DROPDOWN */}
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar placeholder ring-2 ring-transparent hover:ring-[#f14c06]/20 transition-all flex items-center justify-center"
            >
              <div className="bg-linear-to-br from-[#f14c06] to-[#f1b206] text-white flex justify-center items-center rounded-full h-9 w-9 shadow-md shadow-orange-200">
                <span className="text-sm font-bold">{getInitials(user?.name)}</span>
              </div>
            </div>

            {/* ISI DROPDOWN */}
            <ul
              tabIndex={0}
              className="mt-4 z-1 p-0 shadow-xl border border-gray-100 menu menu-sm dropdown-content bg-white rounded-2xl w-64 overflow-hidden animate-fade-in-up"
            >
              {/* Header User Info */}
              <li className="menu-title bg-gray-50 px-5 py-4 border-b border-gray-100">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-800 font-bold text-sm truncate">
                    {user?.name || "Admin User"}
                  </span>
                  <span className="text-gray-400 font-medium text-xs truncate">{user?.email}</span>
                  <span className="badge badge-xs bg-[#f14c06] text-white border-none mt-1 py-2 px-3 self-start">
                    {user?.role || "Super Admin"}
                  </span>
                </div>
              </li>

              {/* Menu Items */}
              <div className="p-2 space-y-1">
                <li>
                  <Link
                    to="/dashboard/settings"
                    className="py-3 px-4 text-gray-600 hover:text-[#f14c06] hover:bg-orange-50 rounded-xl font-medium flex items-center gap-3"
                  >
                    <FiSettings size={16} />
                    Pengaturan
                  </Link>
                </li>

                <div className="divider my-1"></div>

                <li>
                  <button
                    onClick={() => setLogoutModalOpen(true)}
                    className="py-3 px-4 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl font-medium flex items-center gap-3 w-full text-left"
                  >
                    <FiLogOut size={16} />
                    Logout
                  </button>
                </li>
              </div>
            </ul>
          </div>
        </div>
      </div>

      {/* MODAL CONFIRM LOGOUT */}
      <ConfirmationModal
        isOpen={isLogoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
        title="Konfirmasi Logout"
        message="Anda akan keluar dari aplikasi?"
        type="danger"
        confirmText="Ya, Benar"
      />
    </>
  );
};

export default Navbar;
