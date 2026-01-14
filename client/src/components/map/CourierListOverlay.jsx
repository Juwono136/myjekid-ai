import { useState } from "react";
import {
  FiSearch,
  FiTruck,
  FiChevronDown,
  FiChevronUp,
  FiRefreshCw,
  FiInbox,
} from "react-icons/fi";

const CourierListOverlay = ({
  couriers,
  onSelect,
  selectedId,
  searchTerm,
  onSearchChange,
  isRefreshing,
  onRefresh,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // Swipe Up (Positif) -> Expand
      if (distance > minSwipeDistance) {
        setIsExpanded(true);
      }
      // Swipe Down (Negatif) -> Collapse
      if (distance < -minSwipeDistance) {
        setIsExpanded(false);
      }
    }
  };

  // --- COUNTER LOGIC ---
  const activeCount = couriers.filter((c) => c.status !== "OFFLINE").length;

  return (
    <>
      <div
        className={`
          absolute z-20 bg-white/95 backdrop-blur-md shadow-[0_-5px_20px_rgba(0,0,0,0.1)] md:shadow-2xl border-t md:border border-white/50
          transition-all duration-300 ease-in-out flex flex-col
          
          /* Mobile Style: Bottom Sheet */
          bottom-0 left-0 right-0 w-full 
          ${isExpanded ? "h-[65vh]" : "h-20 pb-4"} 
          rounded-t-3xl
          
          /* Desktop Style: Floating Panel */
          md:top-4 md:left-4 md:bottom-4 md:w-80 md:h-auto md:rounded-2xl md:max-h-[calc(100%-2rem)]
        `}
      >
        {/* Header Section dengan Touch Events */}
        <div
          className="flex-none p-4 border-b border-gray-100 bg-white/50 cursor-grab active:cursor-grabbing md:cursor-default relative"
          onClick={() => window.innerWidth < 768 && setIsExpanded(!isExpanded)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Mobile Handle Bar (Indikator Swipe) */}
          <div className="md:hidden flex justify-center mb-3">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full" />
          </div>

          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <FiTruck className="text-[#f14c06]" size={18} />
              <span className="text-sm md:text-base">Kurir Aktif ({activeCount})</span>
            </h2>

            <div className="flex gap-2 items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                className={`btn btn-circle btn-xs btn-ghost hover:bg-orange-50 ${
                  isRefreshing ? "animate-spin text-[#f14c06]" : "text-gray-400"
                }`}
                title="Refresh Data"
              >
                <FiRefreshCw />
              </button>

              {/* Mobile Chevron */}
              <button className="md:hidden text-gray-400 transition-transform duration-300">
                {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div
            className={`transition-all duration-300 overflow-hidden ${
              !isExpanded ? "opacity-0 h-0 md:opacity-100 md:h-auto" : "opacity-100 h-10"
            }`}
          >
            <div className="relative">
              <FiSearch className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari kurir..."
                className="input input-sm input-bordered w-full pl-9 rounded-xl focus:border-[#f14c06] focus:outline-none bg-gray-50 text-sm"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>

        {/* List Content */}
        <div
          className={`flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar transition-opacity duration-200 ${
            !isExpanded ? "hidden md:block opacity-0 md:opacity-100" : "block opacity-100"
          }`}
        >
          {couriers.length === 0 ? (
            /* EMPTY STATE */
            <div className="flex flex-col items-center justify-center h-48 md:h-full text-center text-gray-400">
              <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mb-3">
                <FiInbox size={24} />
              </div>
              <p className="text-sm font-medium">Tidak ada kurir ditemukan</p>
              <p className="text-xs mt-1">Coba kata kunci lain atau refresh</p>
            </div>
          ) : (
            couriers.map((courier) => (
              <div
                key={courier.id}
                onClick={() => onSelect(courier)}
                className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border border-transparent hover:shadow-md ${
                  selectedId === courier.id
                    ? "bg-orange-50 border-orange-200 shadow-sm ring-1 ring-orange-200"
                    : "bg-white hover:bg-gray-50 border-gray-50 shadow-sm"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span
                    className={`font-semibold text-sm ${
                      selectedId === courier.id ? "text-[#f14c06]" : "text-gray-700"
                    }`}
                  >
                    {courier.name}
                  </span>
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 ${
                      courier.status === "IDLE"
                        ? "bg-green-500 animate-pulse"
                        : courier.status === "BUSY"
                        ? "bg-red-500"
                        : "bg-gray-400"
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 mb-2 font-mono">{courier.phone}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                    Shift {courier.shift_code}
                  </span>
                  <span className="text-[10px] text-[#f14c06] font-medium">Lihat Lokasi →</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default CourierListOverlay;
