import { FiSearch, FiSmartphone, FiClock } from "react-icons/fi";
import { format, isToday, isYesterday } from "date-fns";

const ChatSidebar = ({
  sessions = [],
  activeSession,
  onSelectSession,
  searchKeyword,
  onSearchChange,
  isLoading,
}) => {
  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Kemarin";
    return format(date, "dd/MM/yy");
  };

  return (
    <div className="flex flex-col h-full bg-white w-full z-20 relative">
      {/* HEADER: Title & Search */}
      <div className="p-4 bg-white border-b border-gray-100 flex-none">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-extrabold text-gray-800 tracking-tight">Live Chat</h2>
          <div className="badge badge-lg font-bold bg-gray-100 text-gray-600 border-none">
            {sessions.length}
          </div>
        </div>

        <div className="relative group">
          <FiSearch className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#f14c06] transition-colors" />
          <input
            type="text"
            placeholder="Cari nama atau nomor..."
            className="input input-sm w-full pl-10 rounded-xl bg-gray-50 border-transparent focus:border-[#f14c06]/30 focus:bg-white focus:ring-2 focus:ring-[#f14c06]/10 transition-all font-medium"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* LIST SESSIONS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {isLoading ? (
          // SKELETON LOADER MODERN
          [...Array(5)].map((_, i) => (
            <div key={i} className="p-3 px-4 border-b border-gray-50 flex gap-3 animate-pulse">
              <div className="w-12 h-12 bg-gray-100 rounded-full shrink-0"></div>
              <div className="flex-1 space-y-2 py-1">
                <div className="flex justify-between">
                  <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-50 rounded w-10"></div>
                </div>
                <div className="h-3 bg-gray-50 rounded w-2/3"></div>
              </div>
            </div>
          ))
        ) : sessions.length === 0 ? (
          // EMPTY STATE
          <div className="flex flex-col items-center justify-center h-full pb-20 text-gray-400 text-sm p-4 text-center opacity-60">
            <FiClock size={32} className="mb-2" />
            <p className="font-medium">Tidak ada percakapan</p>
          </div>
        ) : (
          // REAL DATA LIST
          sessions.map((session) => {
            const isActive = activeSession?.phone === session.phone;
            const isHuman = session.mode === "HUMAN";
            const unreadCount = session.unreadCount || 0;

            return (
              <div
                key={session.phone}
                onClick={() => onSelectSession(session)}
                className={`
                    relative group p-3 px-4 border-b border-gray-50 cursor-pointer transition-all 
                    hover:bg-gray-50
                    ${isActive ? "bg-[#f0f2f5]" : "bg-white"}
                `}
              >
                <div className="flex gap-3 items-center">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className={`
                            w-12 h-12 rounded-full text-white shadow-sm flex items-center justify-center text-lg font-bold leading-none mt-0.5
                            ${isHuman ? "bg-[#f14c06]" : "bg-gray-400"}
                        `}
                    >
                      {session.user_name?.charAt(0).toUpperCase() || "?"}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 self-center">
                    <div className="flex justify-between items-baseline mb-1">
                      <span
                        className={`truncate font-semibold text-[15px] ${
                          isActive ? "text-gray-900" : "text-gray-800"
                        }`}
                      >
                        {session.user_name || "Tanpa Nama"}
                      </span>
                      <span
                        className={`text-[11px] whitespace-nowrap ml-2 ${
                          unreadCount > 0 ? "text-[#25D366] font-bold" : "text-gray-400"
                        }`}
                      >
                        {formatTime(session.last_interaction)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1 text-sm text-gray-500 truncate w-full pr-2">
                        {/* Preview Pesan / Status */}
                        {session.mode === "HUMAN" ? (
                          <span className="text-[#f14c06] text-xs font-medium border border-[#f14c06]/20 px-1 rounded bg-[#f14c06]/5 mr-1">
                            LIVE
                          </span>
                        ) : null}
                        <span className="flex justify-center items-center gap-1 text-xs">
                          <FiSmartphone />
                          {session.phone}
                        </span>
                      </div>

                      {/* BADGE IJO (Unread) */}
                      {unreadCount > 0 && (
                        <div className="shrink-0 w-5 h-5 rounded-full bg-[#25D366] text-white flex items-center justify-center text-[10px] font-bold shadow-sm animate-pulse">
                          {unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
