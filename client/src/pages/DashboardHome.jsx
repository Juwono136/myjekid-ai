import { FiUsers, FiShoppingBag, FiDollarSign, FiActivity } from "react-icons/fi";

const DashboardHome = () => {
  // Data Dummy dulu (Nanti kita connect ke API Real)
  const stats = [
    {
      title: "Total Order Hari Ini",
      value: "128",
      icon: <FiShoppingBag />,
      color: "text-[#f14c06]",
    },
    { title: "Kurir Aktif (On-Bid)", value: "45", icon: <FiUsers />, color: "text-blue-600" },
    {
      title: "Pendapatan Harian",
      value: "Rp 2.4jt",
      icon: <FiDollarSign />,
      color: "text-green-600",
    },
    { title: "Pending Orders", value: "12", icon: <FiActivity />, color: "text-orange-500" },
  ];

  return (
    <div className="animate-fade-in-up">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard Overview</h2>
        <p className="text-gray-500">Pantau performa MyJek secara real-time.</p>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="stats shadow-sm border border-gray-100 bg-white rounded-2xl">
            <div className="stat">
              <div className={`stat-figure ${stat.color} bg-gray-50 p-3 rounded-full`}>
                {/* Clone element agar bisa resize icon */}
                <div className="text-2xl">{stat.icon}</div>
              </div>
              <div className="stat-title text-gray-500 font-medium">{stat.title}</div>
              <div className="stat-value text-gray-800 text-3xl">{stat.value}</div>
              <div className="stat-desc text-xs mt-1">↗︎ 14% dari kemarin</div>
            </div>
          </div>
        ))}
      </div>

      {/* EMPTY STATE / CONTENT AREA */}
      <div className="card bg-white shadow-sm border border-gray-100 h-96 flex items-center justify-center rounded-2xl">
        <div className="text-center text-gray-400">
          <p>Grafik Penjualan & Peta Live akan muncul di sini.</p>
          <p className="text-xs">(Next Step)</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
