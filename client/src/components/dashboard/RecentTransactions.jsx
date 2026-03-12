import { format } from "date-fns";
import { id } from "date-fns/locale";

const RecentTransactions = ({ orders }) => {
  const formatRupiah = (num) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);

  /** Ringkasan chat_messages (array of string) — max 2 baris, dipotong dengan ... */
  const chatSummary = (chatMessages, maxLines = 2) => {
    if (!Array.isArray(chatMessages) || chatMessages.length === 0) return "—";
    const lines = chatMessages
      .map((m) => (typeof m === "string" ? m : m?.body ?? String(m)).trim())
      .filter(Boolean);
    if (lines.length === 0) return "—";
    const joined = lines.slice(0, maxLines).join(" · ");
    return lines.length > maxLines ? `${joined}…` : joined;
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
      CANCELLED: "bg-red-50 text-red-600 border-red-100",
      PENDING_CONFIRMATION: "bg-amber-100 text-amber-700 border-amber-200",
      ON_PROCESS: "bg-blue-100 text-blue-700 border-blue-200",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
          styles[status] || "bg-gray-100 text-gray-500"
        }`}
      >
        {status?.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="card bg-white border border-gray-100 shadow-sm rounded-2xl flex flex-col h-full overflow-hidden">
      {/* Header Card */}
      <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-white shrink-0">
        <div>
          <h3 className="font-bold text-gray-800">Transaksi Terakhir</h3>
          <p className="text-xs text-gray-400">Real-time order update</p>
        </div>
        <a href="/dashboard/orders" className="text-xs text-orange-800 font-medium hover:underline">
          Lihat Semua
        </a>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto relative">
        <table className="table w-full border-collapse">
          {/* Sticky Header */}
          <thead className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide font-semibold sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="py-3 pl-5 bg-gray-50">Order ID</th>
              <th className="py-3 bg-gray-50">Ringkasan Chat</th>
              <th className="py-3 bg-gray-50">Nama Pelanggan</th>
              <th className="py-3 bg-gray-50">Total Tagihan</th>
              <th className="py-3 bg-gray-50">Status</th>
              <th className="py-3 pr-5 bg-gray-50">Waktu</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-50 bg-white">
            {orders?.map((order) => (
              <tr key={order.order_id} className="hover:bg-blue-50/20 transition-colors">
                <td className="pl-5 py-3 align-top">
                  <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                    {order.order_id}
                  </span>
                </td>
                <td className="py-3 align-top text-xs text-gray-700 max-w-[180px] truncate" title={chatSummary(order.chat_messages, 5)}>
                  {chatSummary(order.chat_messages)}
                </td>
                <td className="py-3 align-top text-xs text-gray-800">
                  {order.user?.name || "—"}
                </td>
                <td className="py-3 align-top font-bold text-gray-700 text-xs">
                  {formatRupiah(order.total_amount)}
                </td>
                <td className="py-3 align-top">
                  <StatusBadge status={order.status} />
                </td>
                <td className="pr-5 py-3 align-top text-xs text-gray-400">
                  {format(new Date(order.created_at), "dd/MM HH:mm", { locale: id })}
                </td>
              </tr>
            ))}

            {(!orders || orders.length === 0) && (
              <tr>
                <td colSpan="7" className="text-center py-10 text-gray-400 text-sm">
                  Belum ada transaksi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentTransactions;
