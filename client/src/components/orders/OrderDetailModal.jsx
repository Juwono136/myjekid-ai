import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrderDetail, clearOrderDetail } from "../../features/orderSlice";
import { FiX, FiNavigation } from "react-icons/fi";
import Loader from "../Loader";

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
  const chatMessages = Array.isArray(orderDetail?.chat_messages)
    ? orderDetail.chat_messages.map((m) => (typeof m === "string" ? m : m?.body ?? ""))
    : [];

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
                    orderDetail.status,
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

                {/* Pesan order (chat pelanggan) */}
                <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                  Pesan order (chat pelanggan){" "}
                  <span className="badge badge-sm badge-neutral">{chatMessages.length} pesan</span>
                </h4>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <h4 className="text-sm font-bold text-gray-800">Seluruh pesan yang di-forward ke kurir</h4>
                  </div>
                  <div className="p-4">
                    {chatMessages.length > 0 ? (
                      <ul className="space-y-3 text-sm text-gray-700">
                        {chatMessages.map((msg, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-400 shrink-0"></span>
                            <span className="leading-relaxed">{msg}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Tidak ada pesan.</p>
                    )}
                  </div>
                </div>

                {/* TOTAL */}
                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                  {orderDetail.receipt_total != null &&
                    Number(orderDetail.receipt_total) !== Number(orderDetail.total_amount) && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                        <p className="text-amber-800 font-medium mb-1">Kurir merevisi total tagihan</p>
                        <p className="text-gray-600 text-xs">
                          Total dari struk: {formatRupiah(orderDetail.receipt_total)} → Total akhir: {formatRupiah(orderDetail.total_amount)}
                        </p>
                      </div>
                    )}
                  <div className="flex justify-end">
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-1">Total Pembayaran</p>
                      <p className="text-2xl font-bold text-[#f14c06]">
                        {formatRupiah(orderDetail.total_amount)}
                      </p>
                    </div>
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
