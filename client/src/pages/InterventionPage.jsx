import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

// Components
import ChatSidebar from "../components/intervention/ChatSidebar";
import ChatWindow from "../components/intervention/ChatWindow";

// Actions & Hooks
import {
  fetchSessions,
  fetchChatHistory,
  sendMessage,
  resolveSession,
  setActiveSession,
  addRealtimeMessage,
} from "../features/interventionSlice";
import useDebounce from "../hooks/useDebounce";

const InterventionPage = () => {
  const dispatch = useDispatch();
  const socketRef = useRef();

  const { sessions, activeSession, messages, isLoadingSessions, isLoadingHistory } = useSelector(
    (state) => state.intervention
  );

  // State untuk toggle view di Mobile
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const debouncedSearch = useDebounce(searchKeyword, 500);

  // --- 1. SETUP SOCKET.IO (REAL-TIME) ---
  useEffect(() => {
    // Inisialisasi Socket
    // Catatan: io() tanpa argumen URL akan otomatis menggunakan origin browser
    // Karena kita sudah setup Proxy di Vite, request ke /socket.io akan diteruskan ke backend port 5000
    socketRef.current = io({
      path: "/socket.io",
      transports: ["polling", "websocket"], // Strategi koneksi paling stabil
    });

    // Event: Terhubung
    socketRef.current.on("connect", () => {
      console.log("✅ Socket Connected! ID:", socketRef.current.id);
    });

    // Event: Pesan Masuk (Intervention Message)
    socketRef.current.on("intervention-message", (newMessage) => {
      console.log("📩 New Realtime Message:", newMessage);

      // Update Redux
      dispatch(addRealtimeMessage(newMessage));

      // Fitur Tambahan: Notifikasi Suara & Toast
      const isFromUser = newMessage.sender === "USER";
      const isChatOpen = activeSession?.phone === newMessage.phone;

      // Jika pesan dari user dan chat-nya SEDANG TIDAK DIBUKA, beri notif heboh
      if (isFromUser && !isChatOpen) {
        // Play Sound (Pastikan file ada di folder public/assets/notification.mp3)
        // const audio = new Audio("/assets/notification.mp3");
        // audio.play().catch(e => console.log("Audio play failed interaction policy"));

        // Tampilkan Toast
        toast(`Pesan baru: ${newMessage.user_name || newMessage.phone}`, {
          icon: "💬",
          duration: 4000,
        });
      }
    });

    // Cleanup saat component di-unmount
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, activeSession]);

  // --- 2. FETCH DATA AWAL ---
  useEffect(() => {
    dispatch(fetchSessions(debouncedSearch));
  }, [dispatch, debouncedSearch]);

  // --- HANDLERS (Sama seperti sebelumnya) ---
  const handleSelectSession = (session) => {
    dispatch(setActiveSession(session));
    dispatch(fetchChatHistory(session.phone));
    setIsMobileChatOpen(true);
  };

  const handleSendMessage = async (text) => {
    if (!activeSession) return;
    try {
      // Kirim ke API
      await dispatch(sendMessage({ phone: activeSession.phone, message: text })).unwrap();
      // NOTE: Kita TIDAK PERLU fetchChatHistory manual lagi di sini
      // Karena Backend Task #2 sudah akan meng-emit pesan yang kita kirim balik ke socket kita
    } catch (error) {
      toast.error(`Gagal kirim pesan: ${error}`);
    }
  };

  const handleResolve = async (phone) => {
    try {
      await dispatch(resolveSession(phone)).unwrap();
      toast.success("Sesi selesai. Kembali ke Bot.");
      // Mode berubah, sidebar akan otomatis update via socket message berikutnya atau manual fetch
      dispatch(fetchSessions(debouncedSearch));
    } catch (error) {
      toast.error("Gagal menyelesaikan sesi.");
    }
  };

  // --- LAYOUT FIXES ---
  return (
    <div className="flex flex-row h-[calc(100vh-120px)] w-full shadow-lg rounded-md bg-gray-100 overflow-hidden">
      {/* Sidebar Wrapper */}
      <div
        className={`
          ${isMobileChatOpen ? "hidden md:flex" : "flex"} 
          w-full md:w-80 lg:w-96 h-full border-r border-gray-200 bg-white z-10 flex-col shrink-0
        `}
      >
        <ChatSidebar
          sessions={sessions}
          activeSession={activeSession}
          onSelectSession={handleSelectSession}
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
          isLoading={isLoadingSessions}
        />
      </div>

      {/* Chat Window Wrapper */}
      <div
        className={`
          ${
            isMobileChatOpen ? "flex fixed inset-0 top-16 bottom-0 z-20 bg-white w-full" : "hidden"
          } 
          md:static md:flex flex-1 h-full min-w-0 flex-col bg-[#efe7dd] z-0
        `}
      >
        <ChatWindow
          session={activeSession}
          messages={messages}
          isLoadingHistory={isLoadingHistory}
          onBack={() => setIsMobileChatOpen(false)}
          onSendMessage={handleSendMessage}
          onResolve={handleResolve}
        />
      </div>
    </div>
  );
};

export default InterventionPage;
