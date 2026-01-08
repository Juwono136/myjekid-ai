import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FiEye, FiUser, FiMapPin } from "react-icons/fi";
import Loader from "../Loader";
import EmptyState from "../common/EmptyState";

const OrderTable = ({ orders, isLoading, onOpenDetail }) => {
  const formatRupiah = (num) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(num);

  const getStatusBadge = (status) => {
    const styles = {
      COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      CANCELLED: "bg-red-50 text-red-600 border-red-100",
      PENDING_CONFIRMATION: "bg-amber-100 text-amber-700 border-amber-200",
      LOOKING_FOR_DRIVER: "bg-blue-100 text-blue-700 border-blue-200",
      ON_PROCESS: "bg-indigo-100 text-indigo-700 border-indigo-200",
      BILL_SENT: "bg-purple-100 text-purple-700 border-purple-200",
    };
    return (
      <span
        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wider ${
          styles[status] || "bg-gray-100 text-gray-500"
        }`}
      >
        {status?.replace(/_/g, " ")}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader type="block" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
          <tr>
            <th className="py-4 pl-6 w-50">Order ID</th>
            <th className="w-60">Customer Info</th>
            <th>Tujuan Pengiriman</th>
            <th>Total Transaksi</th>
            <th>Status</th>
            <th>Waktu</th>
            <th className="text-center pr-6">Detail</th>
          </tr>
        </thead>
        <tbody className="text-sm divide-y divide-gray-50">
          {orders.length > 0 ? (
            orders.map((order) => (
              <tr key={order.order_id} className="hover:bg-orange-50/30 transition-colors group">
                <td className="pl-6 py-4 align-top">
                  <span className="font-mono text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded select-all">
                    {order.order_id}
                  </span>
                </td>
                <td className="align-top">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 p-1.5 bg-blue-50 text-blue-500 rounded-full">
                      <FiUser size={14} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-800 text-sm">
                        {order.user?.name || "User Tanpa Nama"}
                      </span>
                      <span className="text-xs text-gray-400 font-mono mt-0.5">
                        {order.user_phone}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="align-top">
                  <div className="flex items-start gap-2 max-w-55">
                    <FiMapPin className="text-gray-400 mt-1 shrink-0" size={12} />
                    <span
                      className="text-gray-600 text-xs leading-relaxed truncate"
                      title={order.delivery_address}
                    >
                      {order.delivery_address || "-"}
                    </span>
                  </div>
                </td>
                <td className="align-top font-bold text-gray-800">
                  {formatRupiah(order.total_amount)}
                </td>
                <td className="align-top">{getStatusBadge(order.status)}</td>
                <td className="align-top text-xs text-gray-400 font-medium">
                  {order.created_at
                    ? format(new Date(order.created_at), "dd MMM yyyy, HH:mm", { locale: id })
                    : "-"}
                </td>
                <td className="text-center pr-6 align-top">
                  <button
                    onClick={() => onOpenDetail(order.order_id)}
                    className="btn btn-sm btn-ghost btn-square text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                    title="Lihat Detail Transaksi"
                  >
                    <FiEye size={16} />
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <EmptyState message="Tidak ada order yang ditemukan dengan filter ini." />
          )}
        </tbody>
      </table>
    </div>
  );
};

export default OrderTable;
