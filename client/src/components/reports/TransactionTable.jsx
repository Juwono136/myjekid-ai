import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FiUser, FiSmartphone } from "react-icons/fi";

const TransactionTable = ({ transactions, page, totalPages, onPageChange }) => {
  // Helper Warna Status
  const getStatusStyle = (status) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600/20";
      case "CANCELLED":
        return "bg-red-50 text-red-600 ring-1 ring-red-600/10";
      case "ON_PROCESS":
        return "bg-blue-50 text-blue-600 ring-1 ring-blue-600/10";
      case "PENDING_CONFIRMATION":
        return "bg-amber-50 text-amber-600 ring-1 ring-amber-600/20";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  // Helper Initials Avatar
  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 1)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      {/* Table Header */}
      <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Riwayat Transaksi</h3>
          <p className="text-sm text-gray-400 mt-1">Detail pesanan yang masuk periode ini.</p>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider font-semibold border-b border-gray-100">
              <th className="px-6 py-4">Order ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Waktu</th>
              <th className="px-6 py-4">Kurir</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {transactions.length > 0 ? (
              transactions.map((t) => (
                <tr key={t.order_id} className="hover:bg-blue-50/30 transition-colors group">
                  {/* Order ID */}
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {t.order_id}
                    </span>
                  </td>

                  {/* Customer Info */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 border border-white shadow-sm">
                        {getInitials(t.user?.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {t.user?.name || "Deleted User"}
                        </p>
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <FiSmartphone size={10} /> {t.user_phone}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Waktu */}
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {format(new Date(t.created_at), "dd MMM yyyy", { locale: id })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(new Date(t.created_at), "HH:mm", { locale: id })} WIB
                    </div>
                  </td>

                  {/* Kurir */}
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {t.courier ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        {t.courier.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic text-xs">- Belum ada -</span>
                    )}
                  </td>

                  {/* Total */}
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-gray-800">
                      Rp {new Intl.NumberFormat("id-ID").format(t.total_amount)}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusStyle(
                        t.status
                      )}`}
                    >
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-300">
                    <FiUser size={48} className="mb-4 opacity-20" />
                    <p className="text-gray-500 font-medium">Belum ada transaksi</p>
                    <p className="text-sm text-gray-400">Coba ubah periode filter tanggal.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {transactions.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
          <span className="text-xs text-gray-500 font-medium">
            Hal {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 transition"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 transition"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionTable;
