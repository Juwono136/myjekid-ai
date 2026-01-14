import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { IoPieChartOutline } from "react-icons/io5";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { dashboardService } from "../../services/dashboardService";
import Loader from "../Loader";

// --- UTILS ---
const COLORS = {
  COMPLETED: "#10B981",
  CANCELLED: "#EF4444",
  PENDING: "#F59E0B",
  PROCESSING: "#3B82F6",
};
const formatRupiah = (val) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val);

// --- KOMPONEN CHART PENDAPATAN (WIDGET 1) ---
const RevenueChartWidget = () => {
  const [range, setRange] = useState("7days");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getChartData("revenue", range);
      setData(res.data);
    } catch (err) {
      console.error("Gagal load revenue", err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Formatter Sumbu X Responsive
  const xAxisFormatter = (str) => {
    if (!str) return "";
    const date = parseISO(str);
    if (range === "1year") return format(date, "MMM yyyy", { locale: id }); // Jan 2026
    return format(date, "dd MMM", { locale: id }); // 06 Jan
  };

  return (
    <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-100">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">Trend Transaksi Order</h3>
          <p className="text-xs text-gray-500">Status dari trend transaksi sukses (Gross)</p>
        </div>
        <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
          {[
            { l: "7 Hari", v: "7days" },
            { l: "30 Hari", v: "30days" },
            { l: "1 Tahun", v: "1year" },
          ].map((btn) => (
            <button
              key={btn.v}
              onClick={() => setRange(btn.v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                range === btn.v
                  ? "bg-white text-[#f14c06] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {btn.l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <Loader type="block" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            Belum ada data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f14c06" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f14c06" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="displayDate"
                tickFormatter={xAxisFormatter}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                dy={10}
                minTickGap={30} // PENTING: Mencegah text berhimpitan
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(val) =>
                  val >= 1000000 ? `${(val / 1000000).toFixed(1)}jt` : `${val / 1000}rb`
                }
              />
              <Tooltip
                formatter={(val) => [formatRupiah(val), "Total Tagihan"]}
                labelFormatter={(label) =>
                  format(parseISO(label), "eeee, dd MMMM yyyy", { locale: id })
                }
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#f14c06"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorIncome)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

// --- KOMPONEN CHART DISTRIBUSI (WIDGET 2) ---
const DistributionChartWidget = () => {
  const [range, setRange] = useState("7days");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getChartData("distribution", range);

      const mappedData = res.data
        .map((item) => {
          const statusKey = String(item.name).toUpperCase();
          return {
            name: statusKey,
            value: Number(item.value),
            color: COLORS[statusKey] || "#9CA3AF",
          };
        })
        .filter((item) => item.value > 0);

      setData(mappedData);
    } catch (err) {
      console.error("Gagal load distribution chart", err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-100">
      <div className="flex flex-col justify-between mb-4 gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">Distribusi Order</h3>
          <p className="text-xs text-gray-500">Status pesanan/order</p>
        </div>
        {/* Filter Independen untuk Pie Chart */}
        <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100 self-start">
          {[
            { l: "7H", v: "7days" },
            { l: "30H", v: "30days" },
            { l: "1T", v: "1year" },
          ].map((btn) => (
            <button
              key={btn.v}
              onClick={() => setRange(btn.v)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                range === btn.v
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {btn.l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative w-full min-h-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <Loader type="block" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <IoPieChartOutline className="text-4xl mb-2" />
            <p className="text-sm">Data tidak ada</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} Order`, name]} separator=" : " />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{
                  fontSize: "12px",
                  lineHeight: "16px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {!loading && data.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
            <div className="text-center">
              <span className="block text-3xl font-bold text-gray-800">
                {data.reduce((acc, curr) => acc + curr.value, 0)}
              </span>
              <span className="text-xs text-gray-400">Total</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// MAIN COMPONENT
const AnalyticsCharts = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <RevenueChartWidget />
      <DistributionChartWidget />
    </div>
  );
};

export default AnalyticsCharts;
