import { FiTruck, FiAlertCircle } from "react-icons/fi";

const OrderCourierInfo = ({ courier }) => {
  // Jika tidak ada data kurir (misal masih mencari driver)
  if (!courier) {
    return (
      <div className="flex gap-4 items-center p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <div className="w-10 h-10 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center shrink-0">
          <FiAlertCircle size={20} />
        </div>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase">Info Kurir</p>
          <p className="text-sm text-gray-500 italic">Masih Mencari kurir</p>
        </div>
      </div>
    );
  }

  // Jika ada kurir
  return (
    <div className="flex gap-4 items-center p-3 bg-orange-50/40 rounded-xl border border-orange-100 shadow-sm">
      <div className="w-10 h-10 rounded-full bg-purple-50 text-orange-600 flex items-center justify-center shrink-0 relative">
        <FiTruck size={20} />
        {/* Status Dot */}
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${
            courier.status === "BUSY" ? "bg-red-500" : "bg-orange-500"
          }`}
        ></span>
      </div>
      <div className="flex-1">
        <p className="text-xs font-bold text-orange-600 uppercase mb-0.5">Info Kurir</p>
        <p className="font-bold text-gray-800 text-sm leading-tight">{courier.name}</p>
        <div className="flex items-center gap-1 text-gray-500 text-xs font-mono mt-0.5">
          {courier.phone}
        </div>
      </div>
    </div>
  );
};

export default OrderCourierInfo;
