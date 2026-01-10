import { useState } from "react";
import { useDispatch } from "react-redux";
import { toggleSessionMode } from "../../features/interventionSlice";
import toast from "react-hot-toast";
import { FiMessageSquare } from "react-icons/fi";

// Import Bagian Modular (Pastikan path benar)
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import BotStatusFooter from "./BotStatusFooter";
import ModeToggleModal from "./ModeToggleModal";

const ChatWindow = ({ session, messages = [], isLoadingHistory, onBack, onSendMessage }) => {
  const dispatch = useDispatch();

  // State Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState(null); // Mode tujuan

  // --- LOGIC HANDLE MODE (UPDATE: SELALU MODAL) ---
  const handleToggleRequest = () => {
    if (session.mode === "BOT") {
      setPendingMode("HUMAN");
    } else {
      setPendingMode("BOT");
    }
    // Selalu buka modal untuk konfirmasi kedua arah
    setIsModalOpen(true);
  };

  const executeToggle = async () => {
    try {
      if (!pendingMode) return;

      await dispatch(
        toggleSessionMode({
          phone: session.phone,
          mode: pendingMode,
        })
      ).unwrap();

      toast.success(pendingMode === "HUMAN" ? "Mode Human Aktif" : "Bot Diaktifkan Kembali");
      setIsModalOpen(false);
      setPendingMode(null);
    } catch (error) {
      console.error(error);
      toast.error("Gagal mengubah mode chat");
      setIsModalOpen(false);
    }
  };

  // --- EMPTY STATE ---
  if (!session) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#f0f2f5] h-full text-center p-6">
        <div className="bg-white p-6 rounded-full shadow-sm mb-4">
          <FiMessageSquare size={40} className="text-gray-300" />
        </div>
        <h3 className="text-gray-600 font-semibold text-lg">Tidak ada chat dipilih</h3>
        <p className="text-gray-400 text-sm mt-1">Pilih percakapan dari daftar di sebelah kiri.</p>
      </div>
    );
  }

  const isHuman = session.mode === "HUMAN";

  return (
    // FIX CSS MOBILE: h-full (atau h-[100dvh] jika browser mobile address bar masalah)
    <div className="flex flex-col w-full h-dvh bg-white relative mb-16 md:mb-0">
      {/* 1. Modal */}
      <ModeToggleModal
        isOpen={isModalOpen}
        targetMode={pendingMode} // Kirim target mode agar teks modal dinamis
        onClose={() => setIsModalOpen(false)}
        onConfirm={executeToggle}
      />

      {/* 2. Header (Flex None - Tinggi Tetap) */}
      <ChatHeader session={session} onBack={onBack} onToggleMode={handleToggleRequest} />

      {/* 3. Messages Area (Flex-1 - Isi Sisa Ruang) */}
      <MessageList messages={messages} session={session} />

      {/* 4. Footer Area (Flex None - Tinggi Tetap & Z-Index Tinggi) */}
      {/* Bungkus dalam div dengan z-index agar selalu di atas */}
      <div className="flex-none z-40 bg-white sticky bottom-0 w-full">
        {isHuman ? (
          <ChatInput onSendMessage={onSendMessage} />
        ) : (
          <BotStatusFooter onRequestTakeover={handleToggleRequest} />
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
