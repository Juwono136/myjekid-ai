import { useState, useEffect } from "react";
import { FiEdit2, FiTrash2, FiCalendar, FiPhone } from "react-icons/fi";
import useDebounce from "../hooks/useDebounce";
import Loader from "../components/Loader";
import ConfirmationModal from "../components/ConfirmationModal";
import toast from "react-hot-toast";
import { userService } from "../services/userService";

// Modular Components
import PageHeader from "../components/common/PageHeader";
import TableActions from "../components/common/TableActions";
import Pagination from "../components/common/Pagination";
import EmptyState from "../components/common/EmptyState";
import UserFormModal from "../components/userManagement/UserFormModal"; // Import Modal Baru

const UserManagement = () => {
  // --- STATE ---
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Params
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [filterRole, setFilterRole] = useState("ALL");
  const [sortBy, setSortBy] = useState("created_at:desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // --- MODAL STATES ---
  // 1. Modal Form (Input Data)
  const [formModal, setFormModal] = useState({ open: false, mode: "ADD", data: null });

  // 2. Modal Konfirmasi (Untuk Delete & Submit Form)
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    type: "DELETE", // "DELETE" or "SUBMIT"
    title: "",
    message: "",
    dataPayload: null,
  });

  // --- FETCHING ---
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [sortField, sortOrder] = sortBy.split(":");
      const response = await userService.getUsers({
        page: currentPage,
        limit: 10,
        search: debouncedSearch,
        role: filterRole,
        sortBy: sortField,
        order: sortOrder,
      });
      setUsers(response.data);
      setTotalPages(response.meta.totalPages);
    } catch (error) {
      console.error(error);
      toast.error("Gagal memuat data user.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [debouncedSearch, filterRole, sortBy, currentPage]);

  // --- HANDLERS: FORM ACTIONS ---

  // 1. Buka Modal Add
  const handleAddClick = () => {
    setFormModal({ open: true, mode: "ADD", data: null });
  };

  // 2. Buka Modal Edit
  const handleEditClick = (user) => {
    setFormModal({ open: true, mode: "EDIT", data: user });
  };

  // 3. Saat Form di-Submit (Belum ke API, Konfirmasi dulu)
  const handleFormSubmit = (formData) => {
    // Tutup form modal dulu
    setFormModal({ ...formModal, open: false });

    // Buka Konfirmasi Modal
    setConfirmModal({
      open: true,
      type: "SUBMIT",
      title: formModal.mode === "ADD" ? "Tambah User Baru?" : "Simpan Perubahan?",
      message:
        formModal.mode === "ADD"
          ? `Anda akan menambahkan user <b>${formData.full_name}</b> sebagai <b>${formData.role}</b>.`
          : `Anda akan memperbarui akses untuk user <b>${formData.full_name}</b>.`,
      dataPayload: formData, // Simpan data sementara di sini
    });
  };

  // --- HANDLERS: DELETE ACTIONS ---
  const handleDeleteClick = (user) => {
    setConfirmModal({
      open: true,
      type: "DELETE",
      title: "Hapus Pengguna?",
      message: `Apakah Anda yakin ingin menghapus akses untuk <b>${user.full_name}</b>?`,
      dataPayload: user, // Simpan user yg mau dihapus
    });
  };

  // --- EKSEKUSI AKHIR (API CALL) ---
  const executeAction = async () => {
    const { type, dataPayload } = confirmModal;

    try {
      if (type === "DELETE") {
        await userService.deleteUser(dataPayload.id);
        toast.success("User berhasil dihapus");
      } else if (type === "SUBMIT") {
        if (formModal.mode === "ADD") {
          await userService.createUser(dataPayload);
          toast.success("User baru berhasil ditambahkan");
        } else {
          // Edit Mode (ID diambil dari formModal.data.id yg disimpan sebelumnya)
          // dataPayload hanya berisi field yg diedit
          await userService.updateUser(formModal.data.id, dataPayload);
          toast.success("Data user berhasil diperbarui");
        }
      }

      setConfirmModal({ ...confirmModal, open: false });
      fetchUsers(); // Refresh Table
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || "Terjadi kesalahan proses.";
      toast.error(msg);

      // Jika error saat submit, kembalikan modal form agar user bisa perbaiki
      if (type === "SUBMIT") {
        setFormModal({ ...formModal, open: true });
      }
    }
  };

  // --- HELPER RENDER ---
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRoleBadge = (role) => {
    return role === "SUPER_ADMIN"
      ? "bg-red-100 text-red-700 border-red-200"
      : "bg-blue-100 text-blue-700 border-blue-200";
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <PageHeader
        title="Manajemen Pengguna"
        description="Kelola akses staff internal (Admin & CS)."
        btnLabel="Tambah User"
        onBtnClick={handleAddClick}
      />

      <TableActions
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Cari Nama / Email..."
        currentSort={sortBy}
        onSortChange={setSortBy}
        sortOptions={[
          { label: "Terbaru", value: "created_at:desc" },
          { label: "Terlama", value: "created_at:asc" },
          { label: "Nama (A-Z)", value: "full_name:asc" },
          { label: "Nama (Z-A)", value: "full_name:desc" },
        ]}
      >
        <select
          className="select select-bordered rounded-xl w-full sm:w-48 text-sm focus:border-[#f14c06] focus:outline-none"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
        >
          <option value="ALL">Semua Role</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="CS">Customer Service</option>
        </select>
      </TableActions>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <Loader type="block" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full align-middle">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider">
                <tr>
                  <th className="py-4 pl-6">User Profile</th>
                  <th>Nomor HP</th>
                  <th>Role Access</th>
                  <th>Status</th>
                  <th>Bergabung Sejak</th>
                  <th>Last Login</th>
                  <th className="text-right pr-6">Aksi</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-50">
                {users.length > 0 ? (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-4 pl-6">
                        <div className="flex items-center gap-4">
                          <div className="avatar placeholder">
                            <div className="bg-neutral-100 text-neutral-500 mask mask-squircle w-12 h-12 flex items-center justify-center border border-gray-100">
                              <span className="text-xl font-bold">
                                {/* Safety Check: pastikan full_name ada sebelum charAt */}
                                {u.full_name ? u.full_name.charAt(0).toUpperCase() : "?"}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="font-bold text-gray-800">
                              {u.full_name || "Tanpa Nama"}
                            </div>
                            <div className="text-xs text-gray-400 font-medium">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* NOMOR HP */}
                      <td>
                        <div className="flex items-center gap-2 w-max text-gray-600">
                          <FiPhone className="text-gray-400" />
                          {u.phone}
                        </div>
                      </td>

                      {/* KOLOM ROLE (Perbaikan Safety Check) */}
                      <td>
                        <div
                          className={`badge w-max ${getRoleBadge(
                            u.role
                          )} border px-3 py-3 rounded-lg font-bold text-[10px] tracking-wide`}
                        >
                          {/* Safety Check: pastikan role ada */}
                          {u.role ? u.role.replace("_", " ") : "UNKNOWN"}
                        </div>
                      </td>

                      {/* KOLOM STATUS (PERBAIKAN ERROR CLASSNAME) */}
                      <td>
                        {/* Gunakan string template literal yang bersih */}
                        <div
                          className={`flex items-center gap-2 text-xs font-semibold ${
                            u.is_active ? "text-green-600" : "text-gray-400"
                          }`}
                        >
                          {/* Perbaikan: Pastikan className selalu string */}
                          <span
                            className={`w-2 h-2 rounded-full ${
                              u.is_active ? "bg-green-500 animate-pulse" : "bg-gray-300"
                            }`}
                          ></span>
                          {u.is_active ? "Active" : "Inactive"}
                        </div>
                      </td>

                      <td>
                        <div className="flex items-center gap-2 w-max text-gray-600">
                          <FiCalendar className="text-gray-400" />
                          {formatDate(u.created_at)}
                        </div>
                      </td>

                      <td className="text-gray-500">
                        {u.last_login ? (
                          formatDate(u.last_login)
                        ) : (
                          <span className="text-gray-300 italic">Belum pernah</span>
                        )}
                      </td>

                      <td className="text-right pr-6">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn btn-sm btn-ghost btn-square text-blue-600 hover:bg-blue-50 rounded-lg"
                            onClick={() => handleEditClick(u)}
                          >
                            <FiEdit2 size={16} />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost btn-square text-red-500 hover:bg-red-50 rounded-lg"
                            onClick={() => handleDeleteClick(u)}
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyState message="Data user tidak ditemukan." />
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* 1. MODAL FORM INPUT */}
      <UserFormModal
        isOpen={formModal.open}
        mode={formModal.mode}
        initialData={formModal.data}
        onClose={() => setFormModal({ ...formModal, open: false })}
        onSubmit={handleFormSubmit}
      />

      {/* 2. MODAL KONFIRMASI (Reusable untuk Delete & Submit) */}
      <ConfirmationModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ ...confirmModal, open: false })}
        onConfirm={executeAction}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type === "DELETE" ? "danger" : "warning"}
        confirmText={confirmModal.type === "DELETE" ? "Ya, Hapus" : "Ya, Simpan"}
      />
    </div>
  );
};

export default UserManagement;
