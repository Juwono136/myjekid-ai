import React from "react";
import { FiAlertTriangle, FiCheckCircle, FiX } from "react-icons/fi";

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = "warning", // 'warning' | 'danger' | 'success'
  confirmText = "Ya, Lanjutkan",
}) => {
  if (!isOpen) return null;

  // Konfigurasi Style berdasarkan Type
  const styles = {
    warning: {
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
      btnBg: "bg-[#f14c06] hover:bg-[#d14306]",
      icon: <FiAlertTriangle size={24} />,
    },
    danger: {
      iconBg: "bg-red-100",
      iconColor: "text-red-500",
      btnBg: "bg-red-600 hover:bg-red-700",
      icon: <FiAlertTriangle size={24} />,
    },
    success: {
      iconBg: "bg-green-100",
      iconColor: "text-green-500",
      btnBg: "bg-green-600 hover:bg-green-700",
      icon: <FiCheckCircle size={24} />,
    },
  };

  const activeStyle = styles[type] || styles.warning;

  return (
    <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="modal-box w-full max-w-sm p-6 rounded-2xl shadow-2xl relative overflow-hidden bg-white">
        {/* Tombol Close Pojok */}
        <button
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 text-gray-400 hover:bg-gray-100"
        >
          <FiX />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Icon Wrapper */}
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${activeStyle.iconBg} ${activeStyle.iconColor}`}
          >
            {activeStyle.icon}
          </div>

          <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>

          {/* CONTENT WITH HTML SUPPORT (Untuk tag <b>) */}
          <div
            className="text-gray-500 text-sm mb-6 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: message }}
          />

          {/* Action Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="btn flex-1 bg-gray-100 border-none text-gray-600 hover:bg-gray-200 rounded-xl"
            >
              Batal
            </button>
            <button
              onClick={onConfirm}
              className={`btn flex-1 border-none text-white rounded-xl ${activeStyle.btnBg}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
