import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCouriers,
  createCourier,
  updateCourier,
  deleteCourier,
  resetState,
} from "../features/courierSlice";

// --- LIBRARY ---
import toast from "react-hot-toast";
import { FiTruck, FiFilter } from "react-icons/fi";

// --- HOOKS ---
import useDebounce from "../hooks/useDebounce";

// --- COMPONENTS ---
import PageHeader from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import TableActions from "../components/common/TableActions";
import ConfirmationModal from "../components/ConfirmationModal";
import CourierTable from "../components/courier/CourierTable";
import CourierFormModal from "../components/courier/CourierFormModal";

const CourierManagement = () => {
  const dispatch = useDispatch();
  const { couriers, meta, isLoading, isError, message } = useSelector((state) => state.courier);

  // --- STATE ---
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState("created_at:desc"); // State gabungan untuk UI
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce Search
  const debouncedSearch = useDebounce(search, 500);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // --- FETCH DATA ---
  useEffect(() => {
    // [FIX SORTING] Pecah "field:direction" menjadi "sortBy" dan "order"
    const [sortBy, order] = sort.split(":");

    const params = {
      page: currentPage,
      limit: 10,
      search: debouncedSearch,
      status: statusFilter,
      sortBy: sortBy, // Kirim sebagai sortBy (sesuai controller)
      order: order, // Kirim sebagai order (sesuai controller)
    };

    dispatch(fetchCouriers(params));
  }, [dispatch, currentPage, debouncedSearch, statusFilter, sort]);

  useEffect(() => {
    if (isError && message) {
      toast.error(message);
      dispatch(resetState());
    }
  }, [isError, message, dispatch]);

  // --- HANDLERS ---
  const handleSearchChange = (val) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (val) => {
    setSort(val);
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setIsEditMode(false);
    setSelectedCourier(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (courier) => {
    setIsEditMode(true);
    setSelectedCourier(courier);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (courier) => {
    setSelectedCourier(courier);
    setIsDeleteOpen(true);
  };

  const handleSubmitForm = async (formData) => {
    const action = isEditMode
      ? updateCourier({ id: selectedCourier.id, data: formData })
      : createCourier(formData);

    const result = await dispatch(action);
    if (result.meta.requestStatus === "fulfilled") {
      toast.success(isEditMode ? "Data diperbarui" : "Data ditambahkan");
      setIsFormOpen(false);
      // Refresh
      const [sortBy, order] = sort.split(":");
      dispatch(
        fetchCouriers({
          page: currentPage,
          search: debouncedSearch,
          status: statusFilter,
          sortBy,
          order,
        })
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedCourier) return;
    const result = await dispatch(deleteCourier(selectedCourier.id));
    if (result.meta.requestStatus === "fulfilled") {
      toast.success("Data dihapus");
      setIsDeleteOpen(false);
      const [sortBy, order] = sort.split(":");
      dispatch(
        fetchCouriers({
          page: currentPage,
          search: debouncedSearch,
          status: statusFilter,
          sortBy,
          order,
        })
      );
    }
  };

  const breadcrumbItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Mitra Kurir", path: "/couriers", active: true },
  ];

  const sortOptions = [
    { label: "Terbaru", value: "created_at:desc" },
    { label: "Terlama", value: "created_at:asc" },
    { label: "Nama (A-Z)", value: "name:asc" },
    { label: "Nama (Z-A)", value: "name:desc" },
  ];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Manajemen Data Kurir"
        description="Monitor lokasi, status operasional, dan data kurir."
        btnLabel="Tambah Kurir"
        onBtnClick={handleOpenAdd}
      />

      <TableActions
        searchPlaceholder="Cari nama atau no. HP..."
        searchValue={search}
        onSearchChange={handleSearchChange}
        sortOptions={sortOptions}
        currentSort={sort}
        onSortChange={handleSortChange}
      >
        <div className="relative w-full md:w-48">
          <FiFilter className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={handleStatusChange}
            className="select select-bordered pl-10 rounded-xl w-full text-sm focus:border-[#f14c06] focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Status</option>
            <option value="IDLE">IDLE</option>
            <option value="BUSY">BUSY</option>
            <option value="OFFLINE">OFFLINE</option>
            <option value="SUSPEND">SUSPEND</option>
          </select>
        </div>
      </TableActions>

      <CourierTable
        couriers={couriers}
        isLoading={isLoading}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteClick}
      />

      {!isLoading && couriers.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={meta.totalPages}
          onPageChange={setCurrentPage}
          totalItems={meta.totalItems}
        />
      )}

      <CourierFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmitForm}
        isLoading={isLoading}
        isEditMode={isEditMode}
        initialData={selectedCourier}
      />

      <ConfirmationModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Hapus Mitra Kurir?"
        message={`Yakin ingin menghapus <b>${selectedCourier?.name}</b>?`}
        type="danger"
        confirmText={isLoading ? "Menghapus..." : "Ya, Hapus!"}
      />
    </div>
  );
};

export default CourierManagement;
