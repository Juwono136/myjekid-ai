import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getDashboardStats } from "../features/dashboardSlice";
import DashboardSkeleton from "../components/DashboardSkeleton";
import StatsGrid from "../components/dashboard/StatsGrid";
import AnalyticsCharts from "../components/dashboard/AnalyticsCharts";
import RecentTransactions from "../components/dashboard/RecentTransactions";
import QuickActions from "../components/dashboard/QuickActions";
import { FiRefreshCw, FiCalendar } from "react-icons/fi";
import { format } from "date-fns";
import { id } from "date-fns/locale";

const DashboardHome = () => {
  const dispatch = useDispatch();

  // Pastikan reducer anda mengembalikan structure data yang sesuai dengan Backend baru
  // charts: { revenue: [], distribution: [] }
  const { stats, charts, recentOrders, isLoading, isError, message } = useSelector(
    (state) => state.dashboard
  );

  useEffect(() => {
    dispatch(getDashboardStats());
  }, [dispatch]);

  // Loading State
  if (isLoading) return <DashboardSkeleton />;

  // Error State
  if (isError) {
    return (
      <div className="p-6">
        <div className="alert alert-error bg-red-50 border-red-200 text-red-700 shadow-sm rounded-xl">
          <span>Gagal memuat data: {message}</span>
          <button
            className="btn btn-sm btn-ghost text-red-700"
            onClick={() => dispatch(getDashboardStats())}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h2>
          <p className="text-gray-500 mt-1">Overview operasional & performa bisnis.</p>
        </div>
        <div className="flex items-center gap-3 mt-4 md:mt-0">
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 shadow-sm">
            <FiCalendar className="text-gray-400" />
            {format(new Date(), "dd MMMM yyyy", { locale: id })}
          </div>
          <button
            onClick={() => {
              dispatch(getDashboardStats());
              // Chart akan refresh otomatis jika kita mau tambahkan logic refresh signal,
              // tapi untuk sekarang tombol ini khusus refresh Stats Card
            }}
            className="btn btn-ghost btn-sm gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
          >
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      <StatsGrid stats={stats} />

      {/* Chart Component sudah mandiri, tidak butuh props filter */}
      <AnalyticsCharts />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 h-125">
          <RecentTransactions orders={recentOrders} />
        </div>
        <div className="h-125">
          <QuickActions />
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
