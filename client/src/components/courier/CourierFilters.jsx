import { FiSearch, FiFilter } from "react-icons/fi";

const CourierFilters = ({ search, onSearchChange, statusFilter, onStatusChange }) => {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
      {/* Search Bar */}
      <div className="relative w-full md:w-80">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nama atau no. HP..."
          value={search}
          onChange={onSearchChange}
          className="input input-sm w-full pl-10 border-gray-300 focus:input-warning rounded-lg transition-all"
        />
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2 w-full md:w-auto">
        <FiFilter className="text-gray-400" />
        <select
          value={statusFilter}
          onChange={onStatusChange}
          className="select select-sm border-gray-300 focus:select-warning rounded-lg w-full md:w-48"
        >
          <option value="ALL">Semua Status</option>
          <option value="IDLE">IDLE (Siap)</option>
          <option value="BUSY">BUSY (Sibuk)</option>
          <option value="OFFLINE">OFFLINE</option>
          <option value="SUSPEND">SUSPEND (Blokir)</option>
        </select>
      </div>
    </div>
  );
};

export default CourierFilters;
