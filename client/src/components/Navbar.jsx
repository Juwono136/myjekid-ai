import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { FiMenu, FiSettings, FiLogOut } from "react-icons/fi";
import { io } from "socket.io-client";

import { logout } from "../features/authSlice";
import { fetchNotifications, addRealtimeNotification } from "../features/notificationSlice";
import NotificationMenu from "./notification/NotificationMenu";
import Breadcrumbs from "./Breadcrumbs";
import ConfirmationModal from "./ConfirmationModal";

const Navbar = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

  // INIT DATA & SOCKET
  useEffect(() => {
    // Load Data Awal
    dispatch(fetchNotifications({ page: 1, limit: 10, isLoadMore: false }));

    // Setup Socket Listener
    const socket = io({ path: "/socket.io" }); // Sesuaikan path socket backend
    socket.on("new-notification", (notif) => {
      dispatch(addRealtimeNotification(notif));
    });

    return () => socket.disconnect();
  }, [dispatch]);

  const handleLogoutConfirm = () => {
    dispatch(logout());
    setLogoutModalOpen(false);
    window.location.href = "/login";
  };

  const getInitials = (name) => (name ? name.charAt(0).toUpperCase() : "A");

  return (
    <>
      <div className="navbar bg-white/90 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 px-4 h-16 transition-all duration-300">
        {/* BAGIAN KIRI (Sama) */}
        <div className="flex-1 flex items-center gap-3">
          <label
            htmlFor="my-drawer-2"
            className="btn btn-square btn-ghost btn-sm lg:hidden text-orange-800 hover:text-[#f14c06] hover:bg-orange-50 transition-colors"
          >
            <FiMenu size={24} />
          </label>
          <div className="flex flex-col justify-center">
            <div className="lg:hidden font-bold text-gray-700 text-sm">MyJek Admin</div>
            <div className="hidden lg:block">
              <Breadcrumbs />
            </div>
          </div>
        </div>

        {/* BAGIAN KANAN */}
        <div className="flex-none flex items-center gap-2 md:gap-4">
          <NotificationMenu />

          <div className="h-8 w-px bg-gray-200 mx-1 hidden md:block"></div>

          {/* PROFILE DROPDOWN */}
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
            <ul
              tabIndex={0}
              className="mt-4 z-1 p-0 shadow-xl border border-gray-100 menu menu-sm dropdown-content bg-white rounded-2xl w-64 overflow-hidden animate-fade-in-up"
            >
              <li className="menu-title bg-gray-50 px-5 py-4 border-b border-gray-100">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-800 font-bold text-sm truncate">
                    {user?.name || "Admin User"}
                  </span>
                  <span className="text-gray-400 font-medium text-xs truncate">{user?.email}</span>
                </div>
              </li>
              <div className="p-2 space-y-1">
                <li>
                  <Link
                    to="/dashboard/settings"
                    className="py-3 px-4 text-gray-600 hover:text-[#f14c06] hover:bg-orange-50 rounded-xl font-medium flex items-center gap-3"
                  >
                    <FiSettings size={16} /> Pengaturan
                  </Link>
                </li>
                <div className="divider my-1"></div>
                <li>
                  <button
                    onClick={() => setLogoutModalOpen(true)}
                    className="py-3 px-4 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl font-medium flex items-center gap-3 w-full text-left"
                  >
                    <FiLogOut size={16} /> Logout
                  </button>
                </li>
              </div>
            </ul>
          </div>
        </div>
      </div>

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
