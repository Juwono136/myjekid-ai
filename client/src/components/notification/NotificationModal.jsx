import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { FiX, FiSearch, FiCheckSquare, FiInbox, FiLoader } from "react-icons/fi";
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsRead,
} from "../../features/notificationSlice";
import NotificationItem from "./NotificationItem";
import useDebounce from "../../hooks/useDebounce";

const NotificationModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const listRef = useRef(null);
  const navigate = useNavigate();

  const { items, isLoading, hasMore } = useSelector((state) => state.notifications);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = "");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setPage(1);
    dispatch(
      fetchNotifications({
        page: 1,
        limit: 10,
        search: debouncedSearch,
        isLoadMore: false,
      })
    );
  }, [isOpen, debouncedSearch, dispatch]);

  useEffect(() => {
    if (page > 1 && isOpen) {
      dispatch(
        fetchNotifications({
          page,
          limit: 10,
          search: debouncedSearch,
          isLoadMore: true,
        })
      );
    }
  }, [page, isOpen, debouncedSearch, dispatch]);

  const handleScroll = () => {
    if (!listRef.current || !hasMore || isLoading) return;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
      setPage((prev) => prev + 1);
    }
  };

  const handleItemClick = (notif) => {
    if (!notif.is_read) {
      dispatch(markNotificationAsRead(notif.id));
    }

    onClose();
    navigate("/dashboard/chat");
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* MODAL */}
      <div
        className="
        relative z-10
        w-full max-w-md sm:max-w-lg
        h-[92vh] sm:h-[80vh]
        mx-3 sm:mx-0
        bg-white
        rounded-3xl
        shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]
        flex flex-col
        overflow-hidden
        animate-in zoom-in-95 duration-200
      "
      >
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-20">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Notifikasi</h2>
            <p className="text-xs text-gray-400 mt-0.5">Update & aktivitas terbaru sistem</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => dispatch(markAllNotificationsRead())}
              className="p-2 rounded-lg text-[#f14c06] hover:bg-orange-50 transition"
              title="Tandai semua dibaca"
            >
              <FiCheckSquare size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* SEARCH */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 sticky top-18 z-10">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari notifikasi..."
              className="
              w-full pl-10 pr-4 py-2.5
              rounded-xl
              border border-gray-200
              bg-white
              text-sm
              focus:outline-none
              focus:ring-2 focus:ring-[#f14c06]/30
            "
            />
          </div>
        </div>

        {/* LIST */}
        <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-gray-50">
          {items.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <FiInbox size={36} className="opacity-30" />
              <div className="text-center">
                <p className="text-sm font-medium">Tidak ada notifikasi</p>
                <p className="text-xs mt-1">Semua notifikasi akan muncul di sini</p>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`
                  rounded-2xl
                  transition
                  ${
                    item.is_read
                      ? "bg-white hover:bg-gray-50"
                      : "bg-orange-50/60 hover:bg-orange-50"
                  }
                `}
                >
                  <NotificationItem notification={item} onClick={() => handleItemClick(item)} />
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="py-6 text-center text-[#f14c06] text-sm">
              <FiLoader className="animate-spin inline mr-2" />
              Memuat notifikasi...
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NotificationModal;
