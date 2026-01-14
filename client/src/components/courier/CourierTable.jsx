import { FiEdit, FiTrash2 } from "react-icons/fi";
import EmptyState from "../common/EmptyState";
import Loader from "../Loader";

const CourierTable = ({ couriers, isLoading, onEdit, onDelete }) => {
  const getStatusBadge = (status) => {
    const styles = {
      IDLE: "badge-success text-white border-none",
      BUSY: "badge-error text-white border-none",
      OFFLINE: "badge-ghost text-gray-500 bg-gray-100 border-none",
      SUSPEND: "badge-neutral text-white border-none",
    };
    return (
      <div
        className={`badge badge-sm font-semibold h-6 px-3 shadow-sm ${
          styles[status] || styles.OFFLINE
        }`}
      >
        {status}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="table w-full">
          {/* THEAD */}
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
            <tr>
              <th className="py-4 pl-6">Nama & Kontak</th>
              <th>Shift</th>
              <th>Status</th>
              <th>Aktivitas Terakhir</th>
              <th className="text-right pr-6">Aksi</th>
            </tr>
          </thead>

          {/* TBODY */}
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              /* LOADING STATE */
              <tr>
                <td colSpan="5" className="py-10">
                  <div className="flex justify-center items-center w-full">
                    <Loader type="block" />
                  </div>
                </td>
              </tr>
            ) : couriers.length === 0 ? (
              /* Langsung render komponen karena EmptyState Anda sudah punya <tr> sendiri */
              <EmptyState message="Data kurir tidak ditemukan." />
            ) : (
              /* DATA STATE */
              couriers.map((item) => (
                <tr key={item.id} className="hover:bg-orange-50/40 transition-colors duration-200">
                  <td className="pl-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-800 text-sm">{item.name}</span>
                      <span className="text-xs text-gray-500 font-mono mt-1">{item.phone}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm badge-outline font-medium w-max ${
                        item.shift_code === 1
                          ? "badge-info text-blue-600 border-blue-200 bg-blue-50"
                          : "badge-secondary text-pink-600 border-pink-200 bg-pink-50"
                      }`}
                    >
                      {item.shift_code === 1 ? "Shift 1 (Pagi)" : "Shift 2 (Sore)"}
                    </span>
                  </td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td className="text-sm text-gray-500">
                    {item.last_active_at ? (
                      new Date(item.last_active_at).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span className="text-gray-300 italic text-xs">Belum aktif</span>
                    )}
                  </td>
                  <td className="text-right pr-6">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEdit(item)}
                        className="btn btn-sm btn-square btn-ghost text-blue-600 hover:bg-blue-50 transition-all"
                        title="Edit Data"
                      >
                        <FiEdit size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(item)}
                        className="btn btn-sm btn-square btn-ghost text-red-500 hover:bg-red-50 transition-all"
                        title="Hapus Data"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CourierTable;
