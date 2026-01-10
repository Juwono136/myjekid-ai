import { FiDollarSign, FiShoppingBag, FiXOctagon, FiTrendingUp } from "react-icons/fi";

// Sub-komponen agar kode rapi
const StatCard = ({ title, value, icon, colorTheme, subText }) => {
  // Mapping warna tema
  const themes = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    red: "bg-red-50 text-red-600 border-red-100",
  };

  const currentTheme = themes[colorTheme] || themes.blue;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 hover:border-blue-200 transition-all duration-300 group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${currentTheme} transition-colors`}>{icon}</div>
        {/* Placeholder untuk Badge Kenaikan (Logic bisa ditambah nanti) */}
        {/* <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">+12%</span> */}
      </div>

      <div>
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">{title}</p>
        <h3 className="text-2xl font-extrabold text-gray-800 tracking-tight">{value}</h3>
        <p className="text-xs text-gray-400 mt-2 font-medium">{subText}</p>
      </div>
    </div>
  );
};

const SummaryCards = ({ summary }) => {
  const formatRp = (num) => "Rp " + new Intl.NumberFormat("id-ID").format(num);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard
        title="Total Pendapatan"
        value={formatRp(summary.totalRevenue)}
        icon={<FiDollarSign size={24} />}
        colorTheme="blue"
        subText="Total tagihan bersih (Order Selesai)"
      />
      <StatCard
        title="Total Transaksi"
        value={summary.totalTransactions}
        icon={<FiShoppingBag size={24} />}
        colorTheme="purple"
        subText="Pesanan berhasil selesai"
      />
      <StatCard
        title="Rata-rata Order"
        value={formatRp(summary.avgOrderValue)}
        icon={<FiTrendingUp size={24} />}
        colorTheme="emerald"
        subText="Total tagihan per transaksi user"
      />
      <StatCard
        title="Dibatalkan"
        value={summary.totalCancelled}
        icon={<FiXOctagon size={24} />}
        colorTheme="red"
        subText="Transaksi gagal / dibatalkan"
      />
    </div>
  );
};

export default SummaryCards;
