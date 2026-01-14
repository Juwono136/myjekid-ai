import { format } from "date-fns";
import { id } from "date-fns/locale";

const RecentTransactions = ({ orders }) => {
  const formatRupiah = (num) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);

  const parseItems = (json) => {
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object" && parsed !== null) return [parsed];
      return [];
    } catch (e) {
      return [];
    }
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
              <th className="py-3 bg-gray-50">Items Detail</th>
              <th className="py-3 bg-gray-50">Total Tagihan</th>
              <th className="py-3 bg-gray-50">Status</th>
              <th className="py-3 pr-5 bg-gray-50">Waktu</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-50 bg-white">
            {orders?.map((order) => {
              const items = parseItems(order.items_summary);
              return (
                <tr key={order.order_id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="pl-5 py-3 align-top">
                    <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                      {order.order_id}
                    </span>
                  </td>

                  {/* Items Detail Column */}
                  <td className="py-3 align-top">
                    <div className="flex flex-col gap-1">
                      {items.length > 0 ? (
                        items.map((itm, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="font-bold text-gray-700 min-w-5">{itm.qty}x</span>
                            <div className="flex flex-col">
                              <span className="text-gray-800 capitalize">{itm.item}</span>
                              {itm.note && (
                                <span className="text-[10px] text-orange-500 italic">
                                  Note: {itm.note}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="text-gray-300 italic text-xs">-</span>
                      )}
                    </div>
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
              );
            })}

            {(!orders || orders.length === 0) && (
              <tr>
                <td colSpan="5" className="text-center py-10 text-gray-400 text-sm">
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
