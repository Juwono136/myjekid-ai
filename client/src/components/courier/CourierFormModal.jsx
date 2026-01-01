import { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";

const CourierFormModal = ({ isOpen, onClose, onSubmit, initialData, isLoading, isEditMode }) => {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    shift_code: 1,
    status: "OFFLINE",
  });

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && initialData) {
        setFormData({
          name: initialData.name,
          phone: initialData.phone,
          shift_code: initialData.shift_code,
          status: initialData.status,
        });
      } else {
        setFormData({ name: "", phone: "", shift_code: 1, status: "OFFLINE" });
      }
    }
  }, [isOpen, initialData, isEditMode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="modal-box w-full max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl relative">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-gray-800">
            {isEditMode ? "Edit Data Kurir" : "Tambah Mitra Kurir"}
          </h3>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:bg-gray-200"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="form-control">
            <label className="label text-xs font-bold text-gray-500 uppercase">Nama Lengkap</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input input-bordered w-full rounded-xl focus:border-orange-500 focus:outline-none"
              placeholder="Contoh: Budi Santoso"
            />
          </div>

          <div className="form-control">
            <label className="label text-xs font-bold text-gray-500 uppercase">No. WhatsApp</label>
            <input
              type="text"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input input-bordered w-full rounded-xl focus:border-orange-500 focus:outline-none font-mono"
              placeholder="62812xxxx"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label text-xs font-bold text-gray-500 uppercase">Shift</label>
              <select
                value={formData.shift_code}
                onChange={(e) => setFormData({ ...formData, shift_code: parseInt(e.target.value) })}
                className="select select-bordered w-full rounded-xl focus:border-orange-500 focus:outline-none"
              >
                <option value={1}>Shift 1 (Pagi)</option>
                <option value={2}>Shift 2 (Sore)</option>
              </select>
            </div>

            {isEditMode && (
              <div className="form-control">
                <label className="label text-xs font-bold text-gray-500 uppercase">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="select select-bordered w-full rounded-xl focus:border-orange-500 focus:outline-none"
                >
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="IDLE">IDLE</option>
                  <option value="BUSY">BUSY</option>
                  <option value="SUSPEND">SUSPEND</option>
                </select>
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 bg-gray-100 border-none text-gray-600 hover:bg-gray-200 rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn flex-1 bg-[#f14c06] hover:bg-[#d14306] border-none text-white rounded-xl"
            >
              {isLoading ? "Menyimpan..." : "Simpan Data"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourierFormModal;
