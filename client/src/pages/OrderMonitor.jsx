import React, { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrders } from "../features/orderSlice";
import useDebounce from "../hooks/useDebounce";

// Components
import PageHeader from "../components/common/PageHeader";
import TableActions from "../components/common/TableActions";
import Pagination from "../components/common/Pagination";
import OrderTable from "../components/orders/OrderTable"; // New Modular Table
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

  // --- EFFECT: SINKRONISASI SEARCH ---
  useEffect(() => {
    setParams((prev) => ({ ...prev, search: debouncedSearch, page: 1 }));
  }, [debouncedSearch]);

  // --- EFFECT: FETCH DATA ---
  const fetchData = useCallback(() => {
    const apiParams = { ...params };
    if (apiParams.status === "ALL") delete apiParams.status;
    dispatch(fetchOrders(apiParams));
  }, [dispatch, params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- HANDLERS ---
  const handleSortChange = (value) => {
    const [sortBy, sortOrder] = value.split("-");
    setParams((prev) => ({ ...prev, sortBy, sortOrder }));
  };

  return (
    <div className="pb-10 animate-fade-in-up">
      <PageHeader
        title="Order Monitor"
        description="Pantau seluruh transaksi customer secara real-time."
      />

      <TableActions
        searchPlaceholder="Cari Order ID / No HP..."
        onSearchChange={setSearchTerm}
        searchValue={searchTerm}
        currentSort={`${params.sortBy}-${params.sortOrder}`}
        onSortChange={handleSortChange}
        sortOptions={[
          { label: "Order Terbaru", value: "created_at-DESC" },
          { label: "Order Terlama", value: "created_at-ASC" },
          { label: "Transaksi Tertinggi", value: "total_amount-DESC" },
          { label: "Transaksi Terendah", value: "total_amount-ASC" },
        ]}
      >
        <select
          className="select select-bordered rounded-xl w-full sm:w-48 text-sm focus:border-[#f14c06] focus:outline-none"
          value={params.status}
          onChange={(e) => setParams((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
        >
          <option value="ALL">Semua Status</option>
          <option value="PENDING_CONFIRMATION">Menunggu Konfirmasi</option>
          <option value="LOOKING_FOR_DRIVER">Mencari Kurir</option>
          <option value="ON_PROCESS">Sedang Diproses</option>
          <option value="COMPLETED">Selesai</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
      </TableActions>

      {/* MODULAR TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <OrderTable
          orders={orders}
          isLoading={isLoading}
          onOpenDetail={(id) => setDetailModal({ isOpen: true, orderId: id })}
        />

        {!isLoading && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
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
