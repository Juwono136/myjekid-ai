import { useState } from "react";
import ProfileForm from "../components/settings/ProfileForm";
import PasswordForm from "../components/settings/PasswordForm";
import { FiUser, FiLock } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Header Halaman */}
        <PageHeader
          title="Pengaturan Akun"
          description="Kelola profil pribadi dan keamanan akun Anda."
        />

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-2xl px-4 pt-2 shadow-sm">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 px-6 py-4 cursor-pointer text-xs md:text-sm font-medium transition-all border-b-2 outline-none ${
              activeTab === "profile"
                ? "border-[#f14c06] text-[#f14c06]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <FiUser size={18} />
            Profil Saya
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`flex items-center gap-2 px-6 py-4 text-sm cursor-pointer font-medium transition-all border-b-2 outline-none ${
              activeTab === "password"
                ? "border-[#f14c06] text-[#f14c06]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <FiLock size={18} />
            Ganti Password
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="transition-all duration-300 ease-in-out">
          {activeTab === "profile" ? (
            <div className="animate-fadeIn">
              <ProfileForm />
            </div>
          ) : (
            <div className="animate-fadeIn">
              <PasswordForm />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
