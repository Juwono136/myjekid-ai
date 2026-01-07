import { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrders } from "../features/orderSlice";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FiEye, FiUser, FiMapPin } from "react-icons/fi";

// Custom Hooks
import useDebounce from "../hooks/useDebounce";

// Components
import PageHeader from "../components/common/PageHeader";
import TableActions from "../components/common/TableActions";
import Pagination from "../components/common/Pagination";
import EmptyState from "../components/common/EmptyState";
import Loader from "../components/Loader";
import OrderDetailModal from "../components/orders/OrderDetailModal";

const OrderMonitor = () => {
  const dispatch = useDispatch();
  const { orders, pagination, isLoading } = useSelector((state) => state.orders);

  // --- LOCAL STATE ---
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  const [params, setParams] = useState({
    page: 1,
    limit: 10,
    search: "",
    status: "ALL",
    sortBy: "created_at",
    sortOrder: "DESC",
  });

  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    orderId: null,
  });

  // --- EFFECT ---
  useEffect(() => {
    setParams((prev) => ({
      ...prev,
      search: debouncedSearch,
      page: 1,
    }));
  }, [debouncedSearch]);

  const fetchData = useCallback(() => {
    const apiParams = { ...params };
    if (apiParams.status === "ALL") delete apiParams.status;
    dispatch(fetchOrders(apiParams));
  }, [dispatch, params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- HANDLERS ---
  const handleSearchChange = (value) => setSearchTerm(value);

  const handleFilterStatus = (e) => {
    setParams((prev) => ({ ...prev, status: e.target.value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setParams((prev) => ({ ...prev, page: newPage }));
  };

  // --- FIX DISINI (SORTING) ---
  const handleSortChange = (value) => {
    // TableActions mengirim string value langsung (misal: "created_at-DESC")
    // Jadi kita tidak perlu e.target.value lagi
    const [sortBy, sortOrder] = value.split("-");
    setParams((prev) => ({ ...prev, sortBy, sortOrder }));
  };

  const openDetail = (orderId) => {
    setDetailModal({ isOpen: true, orderId });
  };

  // --- HELPER UI ---
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

  return (
    <div className="pb-10 animate-fade-in-up">
      <PageHeader
        title="Order Monitor"
        description="Pantau seluruh transaksi customer secara real-time."
      />

      <TableActions
        searchPlaceholder="Cari Order ID / No HP..."
        onSearchChange={handleSearchChange}
        searchValue={searchTerm}
        currentSort={`${params.sortBy}-${params.sortOrder}`}
        onSortChange={handleSortChange}
        sortOptions={[
          { label: "Order Terbaru", value: "created_at-DESC" },
          { label: "Order Terlama", value: "created_at-ASC" },
          { label: "Tagihan Tertinggi", value: "total_amount-DESC" },
          { label: "Tagihan Terendah", value: "total_amount-ASC" },
        ]}
      >
        <select
          className="select select-bordered rounded-xl w-full sm:w-48 text-sm focus:border-[#f14c06] focus:outline-none"
          value={params.status}
          onChange={handleFilterStatus}
        >
          <option value="ALL">Semua Status</option>
          <option value="PENDING_CONFIRMATION">Menunggu Konfirmasi</option>
          <option value="LOOKING_FOR_DRIVER">Mencari Kurir</option>
          <option value="ON_PROCESS">Sedang Diproses</option>
          <option value="COMPLETED">Selesai</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
      </TableActions>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader type="block" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
                <tr>
                  <th className="py-4 pl-6 w-50">Order ID</th>
                  <th className="w-80">Customer Info</th>
                  <th>Tujuan Pengiriman</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Waktu</th>
                  <th className="text-center pr-6">Detail</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-50">
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <tr
                      key={order.order_id}
                      className="hover:bg-orange-50/30 transition-colors group"
                    >
                      <td className="pl-4 py-4 align-top">
                        <span className="font-mono text-[11px] font-bold text-gray-500 bg-gray-100 py-1 px-2 rounded select-all">
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
                          ? format(new Date(order.created_at), "dd MMM, HH:mm", { locale: id })
                          : "-"}
                      </td>
                      <td className="text-center pr-6 align-top">
                        <button
                          onClick={() => openDetail(order.order_id)}
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
        )}

        {!isLoading && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      <OrderDetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, orderId: null })}
        orderId={detailModal.orderId}
      />
    </div>
  );
};

export default OrderMonitor;
