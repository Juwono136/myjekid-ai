import { FiSearch, FiList } from "react-icons/fi";

const TableActions = ({
  searchPlaceholder = "Cari data...",
  searchValue,
  onSearchChange,
  sortOptions = [],
  onSortChange,
  currentSort,
  children,
}) => {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4 justify-between items-center mb-6">
      {/* LEFT: Search Bar */}
      <div className="relative w-full lg:w-96">
        <FiSearch className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="input input-bordered pl-10 w-full rounded-xl focus:border-[#f14c06] focus:outline-none focus:ring-1 focus:ring-[#f14c06] transition-all text-sm"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* RIGHT: Filters & Sorting */}
      <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
        {/* Slot untuk Filter Spesifik (Filter Status) */}
        {children}

        {/* Generic Sorting Dropdown */}
        {sortOptions.length > 0 && (
          <div className="relative w-full sm:w-auto">
            <FiList className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              className="select select-bordered pl-10 rounded-xl w-full text-sm focus:border-[#f14c06] focus:outline-none cursor-pointer"
              value={currentSort}
              onChange={(e) => onSortChange(e.target.value)}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableActions;
