import { FiDollarSign, FiShoppingBag, FiTruck, FiAlertCircle } from "react-icons/fi";

const StatCard = ({ title, value, subText, icon: Icon, color, bgInfo }) => (
  <div className="card bg-white border border-gray-100 shadow-sm p-5 rounded-2xl flex flex-row items-center justify-between hover:shadow-md transition-all duration-300 h-full">
    <div className="flex-1 min-w-0 pr-4">
      {" "}
      {/* min-w-0 penting untuk truncate */}
      <p className="text-sm font-medium text-gray-400 mb-1 truncate">{title}</p>
      {/* HANDLING ANGKA BESAR: Font responsive + Truncate + Tooltip */}
      <h3
        className="text-sm lg:text-xl font-bold text-gray-800 truncate tracking-tight"
        title={value} // Tooltip bawaan browser muncul saat hover jika terpotong
      >
        {value}
      </h3>
      <p className="text-xs text-gray-400 mt-2 flex items-center gap-1 truncate">{subText}</p>
    </div>

    <div
      className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${bgInfo} ${color}`}
    >
      <Icon size={24} />
    </div>
  </div>
);

const StatsGrid = ({ stats }) => {
  const formatRupiah = (num) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num || 0);

  return (
    // RESPONSIVE GRID: 1 kolom di HP, 2 di Tablet, 4 di Desktop
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      <StatCard
        title="Total Transaksi Bulan Ini"
        value={formatRupiah(stats?.revenueMonth)}
        subText="Total order"
        icon={FiDollarSign}
        color="text-emerald-600"
        bgInfo="bg-emerald-50"
      />
      <StatCard
        title="Total Order"
        value={stats?.ordersMonth || 0}
        subText={`${stats?.ordersToday || 0} order hari ini`}
        icon={FiShoppingBag}
        color="text-blue-600"
        bgInfo="bg-blue-50"
      />
      <StatCard
        title="Kurir Aktif"
        value={stats?.activeCouriers || 0}
        subText="Siap menerima order"
        icon={FiTruck}
        color="text-indigo-600"
        bgInfo="bg-indigo-50"
      />
      <StatCard
        title="Pending Orders"
        value={stats?.pendingOrders || 0}
        subText="Menunggu konfirmasi"
        icon={FiAlertCircle}
        color="text-orange-600"
        bgInfo="bg-orange-50"
      />
    </div>
  );
};

export default StatsGrid;
