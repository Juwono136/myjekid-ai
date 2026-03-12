import { FiAlertTriangle, FiCheckCircle } from "react-icons/fi";

const ModeToggleModal = ({ isOpen, onClose, onConfirm, targetMode, isLoading = false }) => {
  if (!isOpen) return null;

  const isSwitchingToHuman = targetMode === "HUMAN";

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-xs md:max-w-sm w-full p-6 scale-100">
        {/* Header Icon & Title */}
        <div
          className={`flex items-center gap-3 mb-4 ${
            isSwitchingToHuman ? "text-amber-600" : "text-emerald-600"
          }`}
        >
          <div
            className={`p-2 md:p-3 rounded-full shrink-0 ${
              isSwitchingToHuman ? "bg-amber-100" : "bg-emerald-100"
            }`}
          >
            {isSwitchingToHuman ? <FiAlertTriangle size={20} /> : <FiCheckCircle size={20} />}
          </div>
          <h3 className="text-base md:text-lg font-bold text-gray-800">
            {isSwitchingToHuman ? "Ambil Alih Percakapan?" : "Kembalikan ke Bot?"}
          </h3>
        </div>

        {/* Content Text */}
        <div className="text-gray-600 text-xs md:text-sm mb-6 leading-relaxed">
          {isSwitchingToHuman ? (
            <>
              Anda akan masuk ke <b>Mode Human</b>.<br />
              Bot AI akan <b>dimatikan sementara (maks. 5 jam)</b>. Setelah 5 jam, mode otomatis kembali ke Bot.
            </>
          ) : (
            <>
              Anda akan mengaktifkan kembali <b>Mode Bot</b>.<br />
              AI akan mulai menjawab pesan user secara otomatis. Mode Human juga bisa otomatis kembali ke Bot setelah 5 jam.
            </>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-3 py-2 text-xs md:text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs md:text-sm font-bold text-white rounded-lg shadow-sm transition-colors disabled:opacity-50 ${
              isSwitchingToHuman
                ? "bg-[#f14c06] hover:bg-[#d94205]"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isLoading ? "Memproses..." : isSwitchingToHuman ? "Ya, Ambil Alih" : "Ya, Aktifkan Bot"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModeToggleModal;
