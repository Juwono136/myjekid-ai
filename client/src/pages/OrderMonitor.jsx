import { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  fetchOrders,
  updateOrderDetail,
  fetchOrderDetail,
  clearOrderDetail,
  fetchCustomers,
  createOrderByAdmin,
} from "../features/orderSlice";
import useDebounce from "../hooks/useDebounce";

import PageHeader from "../components/common/PageHeader";
import TableActions from "../components/common/TableActions";
import Pagination from "../components/common/Pagination";
import OrderTable from "../components/orders/OrderTable";
import OrderDetailModal from "../components/orders/OrderDetailModal";
import OrderEditModal from "../components/orders/OrderEditModal";
import OrderAddModal from "../components/orders/OrderAddModal";

const OrderMonitor = () => {
  const dispatch = useDispatch();
  const {
    orders,
    pagination,
    isLoading,
    orderDetail,
    isDetailLoading,
    customers,
    isCustomersLoading,
    isCreateByAdminLoading,
  } = useSelector((state) => state.orders);
  const { user } = useSelector((state) => state.auth);

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
  const [editModal, setEditModal] = useState({
    isOpen: false,
    orderId: null,
  });
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    setParams((prev) => ({ ...prev, search: debouncedSearch, page: 1 }));
  }, [debouncedSearch]);

  const fetchData = useCallback(() => {
    const apiParams = { ...params };
    if (apiParams.status === "ALL") delete apiParams.status;
    dispatch(fetchOrders(apiParams));
  }, [dispatch, params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (editModal.isOpen && editModal.orderId) {
      dispatch(fetchOrderDetail(editModal.orderId));
    } else {
      dispatch(clearOrderDetail());
    }
  }, [dispatch, editModal.isOpen, editModal.orderId]);

  useEffect(() => {
    if (addModalOpen) dispatch(fetchCustomers());
  }, [dispatch, addModalOpen]);

  const handleSortChange = (value) => {
    const [sortBy, sortOrder] = value.split("-");
    setParams((prev) => ({ ...prev, sortBy, sortOrder }));
  };

  const editableStatuses = [
    "DRAFT",
    "PENDING_CONFIRMATION",
    "LOOKING_FOR_DRIVER",
    "ON_PROCESS",
    "BILL_VALIDATION",
  ];
  const canEditOrder = (order) =>
    order && editableStatuses.includes(order.status) && ["SUPER_ADMIN", "CS"].includes(user?.role);

  return (
    <div className="pb-10 animate-fade-in-up">
      <PageHeader
        title="Order Monitor"
        description="Pantau seluruh transaksi customer secara real-time."
        btnLabel={["SUPER_ADMIN", "CS"].includes(user?.role) ? "Tambah Order" : undefined}
        onBtnClick={["SUPER_ADMIN", "CS"].includes(user?.role) ? () => setAddModalOpen(true) : undefined}
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
          className="select select-bordered rounded-xl w-full sm:w-44 text-sm focus:border-[#f14c06] focus:outline-none h-11"
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
          onOpenEdit={(id) => setEditModal({ isOpen: true, orderId: id })}
          canEditOrder={canEditOrder}
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

      <OrderEditModal
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, orderId: null })}
        order={orderDetail}
        isLoading={isDetailLoading}
        onSubmit={async (payload) => {
          try {
            await dispatch(updateOrderDetail({ orderId: editModal.orderId, payload })).unwrap();
            toast.success("Order berhasil diperbarui.");
            setEditModal({ isOpen: false, orderId: null });
            fetchData();
          } catch (error) {
            toast.error(error || "Gagal memperbarui order.");
          }
        }}
        onCancelSuccess={() => {
          setEditModal({ isOpen: false, orderId: null });
          fetchData();
        }}
      />

      <OrderAddModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        customers={customers}
        isCustomersLoading={isCustomersLoading}
        isLoading={isCreateByAdminLoading}
        onSubmit={async (payload) => {
          try {
            await dispatch(createOrderByAdmin(payload)).unwrap();
            toast.success("Order berhasil dibuat. Notifikasi dikirim ke pelanggan dan kurir.");
            setAddModalOpen(false);
            fetchData();
          } catch (error) {
            toast.error(error || "Gagal membuat order.");
          }
        }}
      />
    </div>
  );
};

export default OrderMonitor;
