import React from "react";
import { FiAlertTriangle, FiInfo, FiMessageSquare, FiClock } from "react-icons/fi";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

const NotificationItem = ({ notification, onClick }) => {
  // Icon khusus untuk HUMAN_HANDOFF agar admin aware
  const getIcon = () => {
    switch (notification.type) {
      case "HUMAN_HANDOFF":
        return (
          <div className="p-2 rounded-full bg-red-100 text-red-600">
            <FiAlertTriangle size={18} />
          </div>
        );
      case "ORDER_ALERT":
        return (
          <div className="p-2 rounded-full bg-blue-100 text-blue-600">
            <FiInfo size={18} />
          </div>
        );
      default:
        return (
          <div className="p-2 rounded-full bg-gray-100 text-gray-500">
            <FiMessageSquare size={18} />
          </div>
        );
    }
  };

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: id,
  });

  return (
    <div
      onClick={onClick}
      className={`
        flex gap-3 p-4 cursor-pointer hover:shadow-sm border-gray-50 transition-colors hover:bg-gray-50
        ${!notification.is_read ? "bg-orange-50/40" : "bg-white"}
      `}
    >
      <div className="shrink-0 pt-1">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <h4
            className={`text-sm truncate pr-2 ${
              !notification.is_read ? "font-bold text-gray-900" : "font-medium text-gray-700"
            }`}
          >
            {notification.title}
          </h4>
          {!notification.is_read && (
            <span className="w-2 h-2 bg-[#f14c06] rounded-full shrink-0 mt-1.5"></span>
          )}
        </div>
        <p
          className={`text-xs mt-0.5 line-clamp-2 ${
            !notification.is_read ? "text-gray-800" : "text-gray-500"
          }`}
        >
          {notification.message}
        </p>
        <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
          <FiClock size={10} /> <span>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
};

export default NotificationItem;
