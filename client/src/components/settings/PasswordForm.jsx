import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updatePassword, reset, logout } from "../../features/authSlice";
import { FiLock, FiKey, FiAlertCircle, FiEye, FiEyeOff } from "react-icons/fi";
import toast from "react-hot-toast";
import ConfirmationModal from "../ConfirmationModal";

const PasswordForm = () => {
  const dispatch = useDispatch();
  const { loading, success, message, error } = useSelector((state) => state.auth);

  const [passData, setPassData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Handle Sukses Ganti Password
  useEffect(() => {
    if (success) {
      toast.success("Password berhasil diubah! Login ulang dalam 2 detik...", { duration: 3000 });
      setPassData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      dispatch(reset());

      // Delay logout agar toast terbaca
      setTimeout(() => {
        dispatch(logout());
        window.location.href = "/login";
      }, 2000);
    }

    if (error && message) {
      // Filter pesan error
      if (message.toLowerCase().includes("password") || message.toLowerCase().includes("salah")) {
        toast.error(message);
        dispatch(reset());
      }
    }
  }, [success, error, message, dispatch]);

  const handleChange = (e) => {
    setPassData({ ...passData, [e.target.name]: e.target.value });
  };

  const handleInitialSubmit = (e) => {
    e.preventDefault();
    if (!passData.currentPassword || !passData.newPassword) {
      toast.error("Mohon lengkapi semua kolom");
      return;
    }
    if (passData.newPassword !== passData.confirmPassword) {
      toast.error("Konfirmasi password baru tidak cocok!");
      return;
    }
    if (passData.newPassword.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    setIsModalOpen(true); // Buka Modal
  };

  const handleConfirmUpdate = () => {
    dispatch(updatePassword(passData));
    setIsModalOpen(false);
  };

  const renderPasswordInput = (label, name, value, isVisible, setVisible, placeholder) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">{label}</label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {name === "currentPassword" ? (
            <FiLock className="text-gray-400" />
          ) : (
            <FiKey className="text-gray-400" />
          )}
        </div>
        <input
          type={isVisible ? "text" : "password"}
          name={name}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 text-gray-800 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-[#f14c06] transition-all text-sm"
        />
        {/* Toggle Eye Button */}
        <button
          type="button"
          onClick={() => setVisible(!isVisible)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          {isVisible ? <FiEyeOff size={16} /> : <FiEye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-white rounded-b-2xl rounded-tr-2xl shadow-sm border border-gray-200/60 p-6 md:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Warning Banner */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-8 flex gap-3 items-start">
            <FiAlertCircle className="text-[#f14c06] mt-0.5 shrink-0" size={20} />
            <div>
              <h4 className="text-[#f14c06] font-bold text-sm">Penting</h4>
              <p className="text-gray-600 text-xs mt-1 leading-relaxed">
                Demi keamanan, Anda diwajibkan untuk <b>login kembali</b> setelah berhasil mengubah
                password.
              </p>
            </div>
          </div>

          <form onSubmit={handleInitialSubmit} className="space-y-5">
            {renderPasswordInput(
              "Password Saat Ini",
              "currentPassword",
              passData.currentPassword,
              showCurrent,
              setShowCurrent,
              "********"
            )}

            <div className="border-t border-gray-100 my-4"></div>

            <div className="grid grid-cols-1 gap-5">
              {renderPasswordInput(
                "Password Baru",
                "newPassword",
                passData.newPassword,
                showNew,
                setShowNew,
                "Minimal 8 karakter (Huruf Besar, kecil dan angka)"
              )}
              {renderPasswordInput(
                "Ulangi Password",
                "confirmPassword",
                passData.confirmPassword,
                showConfirm,
                setShowConfirm,
                "Ketik ulang password"
              )}
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#f14c06] hover:bg-[#d94100] text-white py-3 rounded-lg font-bold text-sm transition-all shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-70 cursor-pointer"
              >
                {loading ? "Memproses..." : "Update Password & Keluar"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* INTEGRASI MODAL KONFIRMASI */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmUpdate}
        title="Ganti Password?"
        message="Anda akan dikeluarkan dari halaman ini setelah password berhasil diubah. <b>Yakin ingin melanjutkan?</b>"
        type="danger" // Tipe danger karena aksi sensitif
        confirmText="Ya, Ganti Password"
      />
    </>
  );
};

export default PasswordForm;
