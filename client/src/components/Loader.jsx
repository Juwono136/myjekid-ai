const Loader = ({ type = "block" }) => {
  if (type === "full") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <span className="loading loading-spinner loading-lg text-[#f14c06]"></span>
          <p className="text-sm font-medium text-gray-500 animate-pulse">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 flex items-center justify-center">
      <span className="loading loading-spinner loading-md text-[#f14c06]"></span>
    </div>
  );
};

export default Loader;
