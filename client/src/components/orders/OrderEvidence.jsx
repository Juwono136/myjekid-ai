import { useState } from "react";
import { FiFileText, FiMaximize2, FiX } from "react-icons/fi";

const OrderEvidence = ({ imageUrl }) => {
  const [isLightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <div className="mb-6">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <FiFileText /> Bukti Nota / Fisik
        </h4>

        {imageUrl ? (
          <div
            className="relative group rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
          >
            <img
              src={imageUrl}
              alt="Bukti Nota"
              className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => {
                e.target.src = "https://via.placeholder.com/300?text=Gambar+Rusak";
              }}
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="text-white text-xs font-bold flex items-center gap-1 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                <FiMaximize2 /> Perbesar
              </span>
            </div>
          </div>
        ) : (
          <div className="h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 text-sm bg-gray-100">
            <span className="text-xs">Tidak ada foto</span>
          </div>
        )}
      </div>

      {/* Lightbox Overlay */}
      {isLightboxOpen && imageUrl && (
        <div
          className="fixed inset-0 z-100 bg-black/95 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors bg-white/10 p-2 rounded-full hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
          >
            <FiX size={32} />
          </button>
          <img
            src={imageUrl}
            alt="Full Preview"
            className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default OrderEvidence;
