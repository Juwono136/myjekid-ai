import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

import ChatSidebar from "../components/intervention/ChatSidebar";
import ChatWindow from "../components/intervention/ChatWindow";

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

  // SETUP SOCKET.IO (REAL-TIME)
  useEffect(() => {
    // Inisialisasi Socket
    socketRef.current = io({
      path: "/socket.io",
      transports: ["polling", "websocket"],
    });

    // Event: Terhubung
    socketRef.current.on("connect", () => {
      // console.log("✅ Socket Connected! ID:", socketRef.current.id);
    });

    // Event: Pesan Masuk (Intervention Message)
    socketRef.current.on("intervention-message", (newMessage) => {
      // console.log("New Realtime Message:", newMessage);

      // Update Redux
      dispatch(addRealtimeMessage(newMessage));

      // Notifikasi Suara & Toast
      const isFromUser = newMessage.sender === "USER";
      const isChatOpen = activeSession?.phone === newMessage.phone;

      // Jika pesan dari user dan chat-nya SEDANG TIDAK DIBUKA, beri notif suara
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

    // Cleanup
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, activeSession]);

  useEffect(() => {
    dispatch(fetchSessions(debouncedSearch));
  }, [dispatch, debouncedSearch]);

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
    } catch (error) {
      toast.error(`Gagal kirim pesan: ${error}`);
    }
  };

  const handleResolve = async (phone) => {
    try {
      await dispatch(resolveSession(phone)).unwrap();
      toast.success("Sesi selesai. Kembali ke mode Bot.");

      dispatch(fetchSessions(debouncedSearch));
    } catch (error) {
      toast.error("Gagal menyelesaikan sesi.");
    }
  };

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
