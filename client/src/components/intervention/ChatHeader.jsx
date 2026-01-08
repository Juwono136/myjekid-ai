import { FiArrowLeft, FiLock, FiUnlock } from "react-icons/fi";

const ChatHeader = ({ session, onBack, onToggleMode }) => {
  const isHuman = session.mode === "HUMAN";

  return (
    <div className="flex-none h-16 bg-white px-3 md:px-4 flex items-center justify-between border-b border-gray-200 shadow-sm z-30 relative">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        {/* Tombol Back (Hanya Mobile) */}
        <button
          onClick={onBack}
          className="md:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full"
        >
          <FiArrowLeft size={20} />
        </button>

        {/* Avatar */}
        <div className="shrink-0">
          <div
            className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-colors ${
              isHuman ? "bg-[#f14c06]" : "bg-gray-400"
            }`}
          >
            <span className="text-sm md:text-lg font-bold">
              {session.user_name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
        </div>

        {/* Info User */}
        <div className="min-w-0 flex flex-col justify-center">
          <h3 className="font-bold text-gray-800 text-sm md:text-base truncate">
            {session.user_name || "Tanpa Nama"}
          </h3>
          <p className="text-xs text-gray-500 font-mono truncate">{session.phone}</p>
        </div>
      </div>

      {/* Tombol Toggle Mode */}
      <button
        onClick={onToggleMode}
        className={`
          btn btn-xs md:btn-sm gap-1 md:gap-2 border-none shadow-sm transition-all ml-2 shrink-0
          ${
            isHuman
              ? "bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 ring-1 ring-emerald-200"
          }
        `}
      >
        {isHuman ? <FiUnlock size={12} /> : <FiLock size={12} />}
        <span className="font-semibold text-[10px] md:text-xs">
          {isHuman ? "Mode Human" : "Mode Bot"}
        </span>
      </button>
    </div>
  );
};

export default ChatHeader;
