import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { format } from "date-fns";
import { id } from "date-fns/locale";

const RevenueChart = ({ data }) => {
  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-lg text-sm">
          <p className="font-bold text-gray-700">
            {format(new Date(label), "dd MMMM yyyy", { locale: id })}
          </p>
          <p className="text-blue-600 font-semibold mt-1">
            Rp {new Intl.NumberFormat("id-ID").format(payload[0].value)}
          </p>
          <p className="text-gray-500 text-xs">{payload[0].payload.count} Transaksi</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
      <h3 className="text-lg font-bold text-gray-800 mb-6">Tren Pendapatan</h3>
      <div className="h-75 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={(str) => format(new Date(str), "dd/MM")}
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(num) => `${num / 1000}k`}
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueChart;
