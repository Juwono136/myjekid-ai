import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FiClock, FiUser, FiCheckCircle, FiCircle } from "react-icons/fi";

const OrderTimeline = ({ order }) => {
  if (!order) return null;

  const steps = [
    {
      label: "Pesanan Dibuat",
      date: order.created_at,
      active: true,
      icon: <FiClock size={14} />,
    },
    {
      label: "Sedang Diproses",
      date: null,
      active: ["ON_PROCESS", "BILL_SENT", "COMPLETED"].includes(order.status),
      icon: <FiUser size={14} />,
    },
    {
      label: order.status === "CANCELLED" ? "Dibatalkan" : "Selesai",
      date: order.completed_at,
      active: ["COMPLETED", "CANCELLED"].includes(order.status),
      isEnd: true,
      isCancel: order.status === "CANCELLED",
      icon: <FiCheckCircle size={14} />,
    },
  ];

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
        Tracking History
      </h4>
      <div className="space-y-0 pl-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex gap-4 relative">
            {!step.isEnd && (
              <div
                className={`absolute left-2.75 top-6 -bottom-2.5 w-0.5 ${
                  step.active ? "bg-green-200" : "bg-gray-100"
                }`}
              ></div>
            )}
            <div
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0 
              ${
                step.isCancel
                  ? "bg-red-100 border-red-500 text-red-600"
                  : step.active
                  ? "bg-green-100 border-green-500 text-green-600"
                  : "bg-white border-gray-300 text-gray-300"
              }`}
            >
              {step.icon || <FiCircle size={10} />}
            </div>
            <div className="pb-6">
              <p className={`text-sm font-bold ${step.active ? "text-gray-800" : "text-gray-400"}`}>
                {step.label}
              </p>
              {step.date && (
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  {format(new Date(step.date), "dd MMM yyyy, HH:mm", { locale: id })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderTimeline;
