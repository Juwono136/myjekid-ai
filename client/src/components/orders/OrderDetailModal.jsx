import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrderDetail, clearOrderDetail } from "../../features/orderSlice";
import { FiX, FiNavigation } from "react-icons/fi";
import Loader from "../Loader";

import OrderRouteInfo from "./OrderRouteInfo";
import OrderTimeline from "./OrderTimeline";
import OrderEvidence from "./OrderEvidence";
import OrderCourierInfo from "./OrderCourierInfo";

const OrderDetailModal = ({ isOpen, onClose, orderId }) => {
  const dispatch = useDispatch();
  const { orderDetail, isDetailLoading } = useSelector((state) => state.orders);

  useEffect(() => {
    if (isOpen && orderId) {
      dispatch(fetchOrderDetail(orderId));
    } else {
      dispatch(clearOrderDetail());
    }
  }, [isOpen, orderId, dispatch]);

  if (!isOpen) return null;

  const formatRupiah = (num) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(num);
  const parseItems = (json) => {
    try {
      return typeof json === "string" ? JSON.parse(json) : json || [];
    } catch {
      return [];
    }
  };
  const items = orderDetail ? parseItems(orderDetail.items_summary) : [];

  const getStatusColor = (status) => {
    const map = {
      COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
      CANCELLED: "bg-red-50 text-red-700 border-red-200",
      PENDING_CONFIRMATION: "bg-amber-50 text-amber-700 border-amber-200",
      ON_PROCESS: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
    return map[status] || "bg-blue-50 text-blue-700 border-blue-200";
  };

  const imageUrl = orderDetail?.invoice_image_url
    ? `https://s3-storage.mmsdashboard.dev/myjek-invoices/${orderDetail.invoice_image_url}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
          <div>
            <h3 className="text-xl font-bold text-gray-800">Detail Transaksi</h3>
            <p className="text-xs text-gray-500 font-mono mt-1">Ref ID: {orderId}</p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-circle btn-sm btn-ghost hover:bg-gray-200 text-gray-500"
          >
            <FiX size={22} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
          {isDetailLoading || !orderDetail ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3">
              <Loader type="spin" />
              <p className="text-gray-400 text-sm">Memuat data...</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row min-h-full">
              {/* --- LEFT: MAIN INFO --- */}
              <div className="flex-1 p-6 lg:p-8 lg:border-r border-gray-100">
                {/* Status Banner */}
                <div
                  className={`flex items-center gap-3 p-4 rounded-xl border mb-6 ${getStatusColor(
                    orderDetail.status
                  )}`}
                >
                  <FiNavigation size={20} />
                  <div>
                    <p className="text-xs font-bold uppercase opacity-70">Status Pesanan</p>
                    <p className="font-bold text-base">{orderDetail.status?.replace(/_/g, " ")}</p>
                  </div>
                </div>

                {/* Menampilkan Info Pelanggan & Kurir */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Info Pelanggan */}
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex gap-3 items-center">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                      {orderDetail.user?.name?.charAt(0) || "U"}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-600 uppercase">Pelanggan</p>
                      <p className="font-bold text-gray-800 text-sm truncate max-w-37.5">
                        {orderDetail.user?.name || "Tanpa Nama"}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">{orderDetail.user_phone}</p>
                    </div>
                  </div>

                  {/* Info Kurir */}
                  <OrderCourierInfo courier={orderDetail.courier} />
                </div>

                {/* Route Info */}
                <OrderRouteInfo order={orderDetail} />

                <div className="divider my-6"></div>

                {/* ITEMS LIST TABLE */}
                <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                  Rincian Menu{" "}
                  <span className="badge badge-sm badge-neutral">{items.length} Item</span>
                </h4>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                  <table className="table w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="w-16 text-center">Qty</th>
                        <th>Menu Item</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length > 0 ? (
                        items.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-100 last:border-none">
                            <td className="text-center font-bold text-gray-600 bg-gray-50/30">
                              {item.qty}x
                            </td>
                            <td className="py-3">
                              <div className="font-medium text-gray-800">{item.item}</div>
                              {item.note && (
                                <div className="text-xs text-orange-600 mt-1 italic">
                                  Note: {item.note}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="2" className="text-center py-6 text-gray-400 italic">
                            Tidak ada item
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* TOTAL */}
                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Total Pembayaran</p>
                    <p className="text-2xl font-bold text-[#f14c06]">
                      {formatRupiah(orderDetail.total_amount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* --- RIGHT: EVIDENCE & HISTORY --- */}
              <div className="w-full lg:w-96 bg-gray-50/80 p-6 lg:p-8 flex flex-col h-full border-t lg:border-t-0">
                {/* Evidence & Lightbox */}
                <OrderEvidence imageUrl={imageUrl} />

                {/* Timeline */}
                <OrderTimeline order={orderDetail} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
