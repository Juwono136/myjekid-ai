import { FiLock } from "react-icons/fi";

const BotStatusFooter = ({ onRequestTakeover }) => {
  return (
    <div className="flex-none bg-gray-50 p-3 md:p-4 border-t border-gray-200 text-center z-30">
      <div className="flex flex-col md:flex-row items-center justify-center gap-1 text-xs md:text-sm text-gray-500">
        <div className="flex items-center gap-1">
          <FiLock className="text-gray-400" />
          <span>Bot sedang bekerja otomatis.</span>
        </div>
        <button
          onClick={onRequestTakeover}
          className="text-[#f14c06] hover:underline font-semibold ml-1 px-2 py-1 rounded cursor-pointer hover:bg-orange-50 transition-colors"
        >
          Ambil Alih Sekarang
        </button>
      </div>
    </div>
  );
};

export default BotStatusFooter;
