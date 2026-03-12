import { FiLock } from "react-icons/fi";

const BotStatusFooter = ({ onRequestTakeover }) => {
  return (
    <div className="flex-none bg-gray-50 p-3 md:p-4 border-t border-gray-200 text-center z-30">
      <div className="flex flex-col items-center justify-center gap-1 text-xs md:text-sm text-gray-500">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <FiLock className="text-gray-400 shrink-0" />
          <span>Bot sedang bekerja otomatis.</span>
          <button
            onClick={onRequestTakeover}
            className="text-[#f14c06] hover:underline font-semibold px-2 py-1 rounded cursor-pointer hover:bg-orange-50 transition-colors"
          >
            Ambil Alih Sekarang
          </button>
        </div>
        <p className="text-[10px] md:text-xs text-gray-400 italic">
          *) Ambil alih ke Human Mode berlaku selama maksimal 5 jam. Setelah 5 jam, otomatis kembali ke Bot Mode.
        </p>
      </div>
    </div>
  );
};

export default BotStatusFooter;
