import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrderDetail, clearOrderDetail } from "../../features/orderSlice";
import {
  FiX,
  FiUser,
  FiFileText,
  FiMaximize2,
  FiCheckCircle,
  FiCircle,
  FiClock,
  FiNavigation,
} from "react-icons/fi";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import Loader from "../Loader";

const OrderDetailModal = ({ isOpen, onClose, orderId }) => {
  const dispatch = useDispatch();
  const { orderDetail, isDetailLoading } = useSelector((state) => state.orders);

  const [isLightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (isOpen && orderId) {
      dispatch(fetchOrderDetail(orderId));
    } else {
      dispatch(clearOrderDetail());
      setLightboxOpen(false);
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
    if (!json) return [];
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const items = orderDetail ? parseItems(orderDetail.items_summary) : [];

  // Helper Status Color
  const getStatusColor = (status) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "CANCELLED":
        return "bg-red-50 text-red-700 border-red-200";
      case "PENDING_CONFIRMATION":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "ON_PROCESS":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      default:
        return "bg-blue-50 text-blue-700 border-blue-200";
    }
  };

  const imageUrl = orderDetail?.invoice_image_url
    ? `https://minio.portproject.my.id/myjek-invoices/${orderDetail.invoice_image_url}`
    : null;

  // --- COMPONENT: Timeline Status ---
  const renderTimeline = () => {
    if (!orderDetail) return null;
    const steps = [
      {
        label: "Pesanan Dibuat",
        date: orderDetail.created_at,
        active: true,
        icon: <FiClock size={14} />,
      },
      {
        label: "Sedang Diproses",
        date: null,
        active: ["ON_PROCESS", "BILL_SENT", "COMPLETED"].includes(orderDetail.status),
        icon: <FiUser size={14} />,
      },
      {
        label: orderDetail.status === "CANCELLED" ? "Dibatalkan" : "Selesai",
        date: orderDetail.completed_at,
        active: ["COMPLETED", "CANCELLED"].includes(orderDetail.status),
        isEnd: true,
        isCancel: orderDetail.status === "CANCELLED",
        icon: <FiCheckCircle size={14} />,
      },
    ];

    return (
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Tracking History
        </h4>
        <div className="space-y-0 pl-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-4 relative">
              {!step.isEnd && (
                <div
                  className={`absolute left-2.75 top-6 -bottom-2.5 w-0.5 ${
                    step.active ? "bg-green-200" : "bg-gray-100"
                  }`}
                ></div>
              )}
              <div
                className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0 
                ${
                  step.isCancel
                    ? "bg-red-100 border-red-500 text-red-600"
                    : step.active
                    ? "bg-green-100 border-green-500 text-green-600"
                    : "bg-white border-gray-300 text-gray-300"
                }`}
              >
                {step.icon || <FiCircle size={10} />}
              </div>
              <div className="pb-6">
                <p
                  className={`text-sm font-bold ${step.active ? "text-gray-800" : "text-gray-400"}`}
                >
                  {step.label}
                </p>
                {step.date && (
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {format(new Date(step.date), "dd MMM yyyy, HH:mm", { locale: id })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
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
              <p className="text-xs text-gray-500 font-mono mt-1">Order ID: {orderId}</p>
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
                <div className="flex-1 p-6 lg:border-r border-gray-100">
                  {/* Status Banner */}
                  <div
                    className={`flex items-center gap-3 p-4 rounded-xl border mb-6 ${getStatusColor(
                      orderDetail.status
                    )}`}
                  >
                    <FiNavigation size={20} />
                    <div>
                      <p className="text-xs font-bold uppercase opacity-70">Status Pesanan</p>
                      <p className="font-bold text-base">
                        {orderDetail.status?.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>

                  {/* CUSTOMER & RUTE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Customer */}
                    <div className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <FiUser size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Pelanggan</p>
                        <p className="font-bold text-gray-800">
                          {orderDetail.user?.name || "Tanpa Nama"}
                        </p>
                        <p className="text-sm text-gray-500 font-mono">{orderDetail.user_phone}</p>
                      </div>
                    </div>

                    {/* Rute (Visual Stepper) */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 relative shadow-sm overflow-hidden">
                      {/* Pickup Address (Optional) */}
                      {orderDetail.pickup_address && (
                        <div className="flex gap-4 mb-4 relative z-10">
                          <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5 ring-4 ring-blue-100"></div>
                          <div>
                            <p className="text-xs font-bold text-blue-600 uppercase mb-0.5">
                              Lokasi Jemput (Toko/Titik)
                            </p>
                            <p className="text-sm text-gray-700 leading-snug">
                              {orderDetail.pickup_address}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Delivery Address */}
                      <div className="flex gap-4 relative z-10">
                        <div className="w-3 h-3 rounded-full bg-[#f14c06] mt-1.5 ring-4 ring-orange-100"></div>
                        <div>
                          <p className="text-xs font-bold text-[#f14c06] uppercase mb-0.5">
                            Lokasi Tujuan
                          </p>
                          <p className="text-sm text-gray-700 leading-snug font-medium">
                            {orderDetail.delivery_address || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="divider my-6"></div>

                  {/* ITEMS LIST */}
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
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <FiFileText /> Bukti Nota
                  </h4>

                  {imageUrl ? (
                    <div
                      className="relative group rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white cursor-zoom-in"
                      onClick={() => setLightboxOpen(true)}
                    >
                      <img
                        src={imageUrl}
                        alt="Bukti Nota"
                        className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          e.target.src = "https://via.placeholder.com/300?text=Gambar+Rusak";
                        }}
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <span className="text-white text-xs font-bold flex items-center gap-1 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                          <FiMaximize2 /> Perbesar
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 text-sm bg-gray-100">
                      <span className="text-xs">Tidak ada foto</span>
                    </div>
                  )}

                  {renderTimeline()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {isLightboxOpen && imageUrl && (
        <div
          className="fixed inset-0 z-100 bg-black/95 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors bg-white/10 p-2 rounded-full hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
          >
            <FiX size={32} />
          </button>
          <img
            src={imageUrl}
            alt="Full Preview"
            className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default OrderDetailModal;
