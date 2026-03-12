import { useState } from "react";
import { useDispatch } from "react-redux";
import { toggleSessionMode, fetchSessions } from "../../features/interventionSlice";
import toast from "react-hot-toast";
import { FiMessageSquare } from "react-icons/fi";

import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import BotStatusFooter from "./BotStatusFooter";
import ModeToggleModal from "./ModeToggleModal";

const ChatWindow = ({ session, messages = [], isLoadingHistory, onBack, onSendMessage }) => {
  const dispatch = useDispatch();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleRequest = () => {
    if (!session?.phone) return;
    if (session.mode === "BOT") {
      setPendingMode("HUMAN");
    } else {
      setPendingMode("BOT");
    }
    setIsModalOpen(true);
  };

  const executeToggle = async () => {
    if (!pendingMode || !session?.phone) {
      setIsModalOpen(false);
      setPendingMode(null);
      return;
    }
    setIsToggling(true);
    try {
      await dispatch(
        toggleSessionMode({
          phone: String(session.phone).trim(),
          mode: pendingMode,
        })
      ).unwrap();

      toast.success(pendingMode === "HUMAN" ? "Mode Human Aktif" : "Bot Diaktifkan Kembali");
      setIsModalOpen(false);
      setPendingMode(null);
      dispatch(fetchSessions());
    } catch (error) {
      console.error("Toggle mode error:", error);
      toast.error(error?.message || "Gagal mengubah mode chat");
      setIsModalOpen(false);
      setPendingMode(null);
    } finally {
      setIsToggling(false);
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
    <div className="flex flex-col w-full h-dvh bg-white relative mb-16 md:mb-0">
      {/* Modal */}
      <ModeToggleModal
        isOpen={isModalOpen}
        targetMode={pendingMode}
        onClose={() => !isToggling && setIsModalOpen(false)}
        onConfirm={executeToggle}
        isLoading={isToggling}
      />

      {/* Header */}
      <ChatHeader session={session} onBack={onBack} onToggleMode={handleToggleRequest} />

      {/* Messages Area */}
      <MessageList messages={messages} session={session} />

      {/* 4. Footer Area */}
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
