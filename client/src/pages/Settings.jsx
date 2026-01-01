import { useState } from "react";
import { useSelector } from "react-redux";
import { FiUser, FiLock, FiSave, FiCheckCircle } from "react-icons/fi";
import toast from "react-hot-toast";

const Settings = () => {
  const { user } = useSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState("profile"); // profile | security

  // State Dummy Form
  const [profileData, setProfileData] = useState({
    fullName: user?.name || "",
    email: user?.email || "",
    phone: "081234567890", // Contoh
  });

  const [passwordData, setPasswordData] = useState({
    currentPass: "",
    newPass: "",
    confirmPass: "",
  });

  const handleSaveProfile = (e) => {
    e.preventDefault();
    // Simulasi Save
    toast.success("Profil berhasil diperbarui!");
  };

  const handleSavePassword = (e) => {
    e.preventDefault();
    if (passwordData.newPass !== passwordData.confirmPass) {
      toast.error("Konfirmasi password tidak cocok!");
      return;
    }
    toast.success("Password berhasil diubah!");
    setPasswordData({ currentPass: "", newPass: "", confirmPass: "" });
  };

  return (
    <div className="animate-fade-in-up max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Pengaturan Akun</h2>
          <p className="text-gray-500 text-sm mt-1">
            Kelola informasi profil dan keamanan akun Anda.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* LEFT COLUMN: TABS */}
        <div className="w-full lg:w-1/4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex flex-col gap-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "profile"
                  ? "bg-orange-50 text-[#f14c06]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <FiUser size={18} /> Edit Profil
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "security"
                  ? "bg-orange-50 text-[#f14c06]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <FiLock size={18} /> Keamanan & Password
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: CONTENT */}
        <div className="w-full lg:w-3/4">
          {/* TAB 1: PROFILE FORM */}
          {activeTab === "profile" && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FiUser className="text-[#f14c06]" /> Informasi Pribadi
              </h3>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="form-control">
                    <label className="label text-xs font-bold text-gray-500 uppercase">
                      Nama Lengkap
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full rounded-xl bg-gray-50 focus:bg-white focus:border-[#f14c06]"
                      value={profileData.fullName}
                      onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label text-xs font-bold text-gray-500 uppercase">
                      Nomor Telepon
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full rounded-xl bg-gray-50 focus:bg-white focus:border-[#f14c06]"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Email (Read Only)
                  </label>
                  <input
                    type="email"
                    disabled
                    className="input input-bordered w-full rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed"
                    value={profileData.email}
                  />
                  <label className="label text-[10px] text-gray-400">
                    Hubungi Super Admin untuk mengubah email.
                  </label>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    className="btn bg-[#f14c06] hover:bg-[#d14306] text-white border-none rounded-xl px-8"
                  >
                    <FiSave /> Simpan Perubahan
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: SECURITY FORM */}
          {activeTab === "security" && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FiLock className="text-[#f14c06]" /> Ganti Password
              </h3>

              <form onSubmit={handleSavePassword} className="space-y-5 max-w-md">
                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Password Lama
                  </label>
                  <input
                    type="password"
                    className="input input-bordered w-full rounded-xl focus:border-[#f14c06]"
                    value={passwordData.currentPass}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, currentPass: e.target.value })
                    }
                  />
                </div>

                <div className="divider"></div>

                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Password Baru
                  </label>
                  <input
                    type="password"
                    className="input input-bordered w-full rounded-xl focus:border-[#f14c06]"
                    value={passwordData.newPass}
                    onChange={(e) => setPasswordData({ ...passwordData, newPass: e.target.value })}
                  />
                </div>

                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Konfirmasi Password Baru
                  </label>
                  <input
                    type="password"
                    className="input input-bordered w-full rounded-xl focus:border-[#f14c06]"
                    value={passwordData.confirmPass}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPass: e.target.value })
                    }
                  />
                </div>

                <div className="flex justify-start pt-4">
                  <button
                    type="submit"
                    className="btn bg-[#222] hover:bg-black text-white border-none rounded-xl px-8"
                  >
                    <FiCheckCircle /> Update Password
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
