import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateProfile, reset } from "../../features/authSlice";
import { FiUser, FiSmartphone, FiMail, FiSave } from "react-icons/fi";
import toast from "react-hot-toast";
import ConfirmationModal from "../ConfirmationModal";

const ProfileForm = () => {
  const dispatch = useDispatch();
  const { user, loading, success, message, error } = useSelector((state) => state.auth);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
  });

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Format Role (SUPER_ADMIN -> Super Admin)
  const formatRole = (role) => {
    if (!role) return "USER";
    return role
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.name || "",
        phone: user.phone || "",
        email: user.email || "",
      });
    }
  }, [user]);

  // Handle Feedback
  useEffect(() => {
    if (success && message === "Profil berhasil diperbarui.") {
      toast.success("Profil berhasil diperbarui!");
      dispatch(reset());
    }
    if (error) {
      toast.error(message || "Gagal update profil");
      dispatch(reset());
    }
  }, [success, error, message, dispatch]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleInitialSubmit = (e) => {
    e.preventDefault();
    setIsModalOpen(true); // Buka modal dulu
  };

  const handleConfirmSave = () => {
    dispatch(
      updateProfile({
        full_name: formData.full_name,
        phone: formData.phone,
      })
    );
    setIsModalOpen(false); // Tutup modal
  };

  return (
    <>
      <div className="bg-white rounded-b-2xl rounded-tr-2xl shadow-sm border border-gray-200/60 p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Kolom Kiri: Avatar */}
          <div className="md:w-1/3 flex flex-col items-center text-center space-y-4 pt-4">
            <div className="w-24 h-24 bg-linear-to-br from-blue-100 to-blue-50 rounded-full flex items-center justify-center text-blue-600 shadow-inner">
              <FiUser size={40} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">{formData.full_name || "Admin"}</h3>

              <p className="text-blue-600 text-xs uppercase tracking-wider font-bold bg-blue-50 px-3 py-1 rounded-full inline-block mt-1">
                {formatRole(user?.role)}
              </p>
            </div>
            <p className="text-xs italic text-gray-400 leading-relaxed px-4">
              *) Foto profil dibuat otomatis. Anda hanya dapat mengubah informasi nama dan No. HP.
            </p>
          </div>

          {/* Kolom Kanan: Form */}
          <div className="md:w-2/3 md:border-l md:border-gray-100 md:pl-8">
            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              Edit Informasi
            </h2>

            <form onSubmit={handleInitialSubmit} className="space-y-6">
              {/* Email (Readonly) */}
              <div className="group">
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                  Email Akun
                </label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    readOnly
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 text-gray-500 rounded-lg cursor-not-allowed focus:outline-none text-sm"
                  />
                </div>
              </div>

              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                  />
                </div>
              </div>

              {/* No HP */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">
                  Nomor Telepon
                </label>
                <div className="relative">
                  <FiSmartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                    placeholder="Contoh: 08123456789"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2 disabled:opacity-70 cursor-pointer"
                >
                  {loading ? (
                    "Menyimpan..."
                  ) : (
                    <>
                      <FiSave size={16} /> Simpan Perubahan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* INTEGRASI MODAL KONFIRMASI */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmSave}
        title="Simpan Perubahan?"
        message={`Apakah Anda yakin ingin mengubah data profil untuk <b>${formData.full_name}</b>?`}
        type="warning"
        confirmText="Ya, Simpan"
      />
    </>
  );
};

export default ProfileForm;
