import { FiSearch, FiList } from "react-icons/fi";

const TableActions = ({
  searchPlaceholder = "Cari data...",
  searchValue,
  onSearchChange,
  sortOptions = [],
  onSortChange,
  currentSort,
  children,
  rightAction,
}) => {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center mb-6">
      {/* LEFT: Search Bar */}
      <div className="relative w-full lg:w-80 xl:w-96 flex-shrink-0">
        <FiSearch className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="input input-bordered pl-10 w-full rounded-xl focus:border-[#f14c06] focus:outline-none focus:ring-1 focus:ring-[#f14c06] transition-all text-sm h-11"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* CENTER-RIGHT: Filters & Sorting + Optional rightAction */}
      <div className="flex flex-col sm:flex-row flex-1 gap-3 items-stretch sm:items-center justify-end">
        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3 items-stretch sm:items-center">
          {children}
          {sortOptions.length > 0 && (
            <div className="relative w-full sm:w-auto">
              <FiList className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                className="select select-bordered pl-10 rounded-xl w-full sm:w-auto min-w-[140px] text-sm focus:border-[#f14c06] focus:outline-none cursor-pointer h-11"
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
        {rightAction && (
          <div className="flex items-center shrink-0">{rightAction}</div>
        )}
      </div>
    </div>
  );
};

export default TableActions;
