import React, { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FiBell, FiChevronRight, FiInbox } from "react-icons/fi";
import { markNotificationAsRead } from "../../features/notificationSlice";
import NotificationItem from "./NotificationItem";
import NotificationModal from "./NotificationModal";
import { useNavigate } from "react-router-dom";

const NotificationMenu = () => {
  const dispatch = useDispatch();
  const { items, unreadCount } = useSelector((state) => state.notifications);
  const [isOpen, setIsOpen] = useState(false); // State kontrol manual
  const [showModal, setShowModal] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown jika klik di luar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const previewItems = items.slice(0, 5); // Ambil 5 teratas

  const handleItemClick = (notif) => {
    if (!notif.is_read) dispatch(markNotificationAsRead(notif.id));
    if (notif.action_url) {
      navigate("/dashboard/chat");
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* 1. Tombol Lonceng */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`btn btn-ghost btn-circle btn-sm relative transition-all ${
          isOpen ? "bg-orange-50 text-[#f14c06]" : "text-gray-500 hover:text-[#f14c06]"
        }`}
      >
        <div className="indicator">
          <FiBell size={20} className={unreadCount > 0 ? "animate-swing" : ""} />
          {unreadCount > 0 && (
            <span className="badge badge-xs badge-error absolute -top-1 -right-1 border-white border-2 w-3 h-3 p-0 bg-[#f14c06]"></span>
          )}
        </div>
      </button>

      {/* 2. Dropdown (Manual Absolute Positioning) */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 animate-in fade-in slide-in-from-top-2 origin-top-right overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-bold text-gray-800 text-sm">Notifikasi Terbaru</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold text-[#f14c06] bg-orange-100 px-2 py-0.5 rounded-full">
                {unreadCount} Baru
              </span>
            )}
          </div>

          {/* List Preview */}
          <div className="max-h-75 overflow-y-auto">
            {previewItems.length === 0 ? (
              <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                <FiInbox size={24} className="opacity-30 mb-2" />
                <span className="text-xs">Belum ada notifikasi</span>
              </div>
            ) : (
              previewItems.map((item) => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  onClick={() => handleItemClick(item)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <button
            onClick={() => {
              setIsOpen(false);
              setShowModal(true);
            }}
            className="w-full py-3 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-orange-50 hover:text-[#f14c06] border-t border-gray-100 flex items-center justify-center gap-1 transition-colors"
          >
            Lihat Semua Notifikasi <FiChevronRight />
          </button>
        </div>
      )}

      {/* 3. Modal Full */}
      <NotificationModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
};

export default NotificationMenu;
