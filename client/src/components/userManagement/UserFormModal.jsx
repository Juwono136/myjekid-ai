import { useEffect, useState } from "react";
import { FiX, FiSave, FiAlertCircle } from "react-icons/fi";

const UserFormModal = ({ isOpen, onClose, mode, initialData, onSubmit }) => {
  if (!isOpen) return null;

  const isEdit = mode === "EDIT";

  // State Form
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "", // Hanya dipakai saat ADD
    phone: "",
    role: "CS",
    is_active: true,
  });

  // Load Data saat Edit Mode
  useEffect(() => {
    if (isEdit && initialData) {
      setFormData({
        full_name: initialData.full_name,
        email: initialData.email,
        role: initialData.role,
        phone: initialData.phone,
        is_active: initialData.is_active,
        password: "", // Password kosongkan saat edit
      });
    } else {
      // Reset saat Add Mode
      setFormData({
        full_name: "",
        email: "",
        password: "",
        phone: "",
        role: "CS",
        is_active: true,
      });
    }
  }, [mode, initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Kirim data ke Parent untuk diproses konfirmasi
    onSubmit(formData);
  };

  return (
    <div className="modal modal-open z-50 backdrop-blur-sm bg-black/40">
      <div className="modal-box w-11/12 max-w-lg bg-white rounded-2xl shadow-2xl p-0 overflow-hidden">
        {/* Header Modal */}
        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-800">
            {isEdit ? "Edit Akses Pengguna" : "Tambah Pengguna Baru"}
          </h3>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:bg-gray-200"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 1. INFORMASI DASAR (Read Only saat Edit) */}
          <div className="space-y-3">
            <div className="form-control">
              <label className="label-text text-xs font-bold text-gray-500 uppercase mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                name="full_name"
                required
                disabled={isEdit} // Disabled saat edit
                className={`input input-bordered w-full rounded-xl ${
                  isEdit ? "bg-gray-100 text-gray-500" : "bg-white"
                }`}
                value={formData.full_name}
                onChange={handleChange}
                placeholder="Contoh: Budi Santoso"
              />
            </div>

            <div className="form-control">
              <label className="label-text text-xs font-bold text-gray-500 uppercase mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                disabled={isEdit} // Disabled saat edit
                className={`input input-bordered w-full rounded-xl ${
                  isEdit ? "bg-gray-100 text-gray-500" : "bg-white"
                }`}
                value={formData.email}
                onChange={handleChange}
                placeholder="email@myjek.com"
              />
            </div>

            {/* phone */}
            <div className="form-control">
              <label className="label text-xs font-bold text-gray-500 uppercase">
                No. WhatsApp
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={15}
                required
                value={formData.phone}
                disabled={isEdit}
                onChange={(e) => {
                  const onlyNumbers = e.target.value.replace(/\D/g, "");
                  setFormData({ ...formData, phone: onlyNumbers });
                }}
                className="input input-bordered w-full rounded-xl focus:border-orange-500 focus:outline-none font-mono"
                placeholder="62812xxxx"
              />
            </div>

            {/* Password hanya muncul saat ADD */}
            {!isEdit && (
              <div className="form-control">
                <label className="label-text text-xs font-bold text-gray-500 uppercase mb-1">
                  Password Awal
                </label>
                <input
                  type="password"
                  name="password"
                  required={!isEdit}
                  className="input input-bordered w-full rounded-xl"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min. 8 karakter (Huruf Besar, Kecil, Angka)"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  *User wajib mengganti password setelah login pertama.
                </p>
              </div>
            )}
          </div>

          {isEdit && (
            <div className="divider text-xs text-gray-400">PENGATURAN AKSES (EDITABLE)</div>
          )}

          {/* 2. PENGATURAN AKSES (Editable oleh Admin) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label-text text-xs font-bold text-gray-500 uppercase mb-1">
                Role Akses
              </label>
              <select
                name="role"
                className="select select-bordered w-full rounded-xl focus:border-[#f14c06]"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="CS">Customer Service</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label-text text-xs font-bold text-gray-500 uppercase mb-1">
                Status Akun
              </label>
              <div className="flex items-center h-12 px-3 border border-gray-200 rounded-xl bg-gray-50">
                <label className="cursor-pointer label gap-3 w-full justify-start">
                  <input
                    type="checkbox"
                    name="is_active"
                    className="toggle toggle-success toggle-sm"
                    checked={formData.is_active}
                    onChange={handleChange}
                  />
                  <span
                    className={`text-sm font-medium ${
                      formData.is_active ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    {formData.is_active ? "Aktif" : "Non-Aktif"}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Warning Message saat Edit */}
          {isEdit && (
            <div className="alert alert-warning bg-orange-50 border-orange-100 p-3 text-xs flex gap-2 rounded-xl text-orange-800">
              <FiAlertCircle size={20} className="shrink-0" />
              <span>
                <b>Perhatian:</b> Perubahan nama & password hanya dapat dilakukan oleh user yang
                bersangkutan melalui halaman Pengaturan.
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="modal-action mt-6">
            <button type="button" onClick={onClose} className="btn btn-ghost rounded-xl">
              Batal
            </button>
            <button
              type="submit"
              className="btn bg-[#f14c06] hover:bg-[#d14306] text-white border-none rounded-xl px-6 gap-2"
            >
              <FiSave /> Simpan Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserFormModal;
