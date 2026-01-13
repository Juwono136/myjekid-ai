import { FiMessageCircle, FiDatabase, FiExternalLink } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { SiN8N } from "react-icons/si";

const ActionBtn = ({ label, desc, icon: Icon, onClick, colorClass, bgClass }) => (
  <button
    onClick={onClick}
    className="flex flex-row items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 hover:shadow-md hover:border-blue-200 transition-all group text-left w-full"
  >
    <div
      className={`p-3 rounded-lg ${bgClass} ${colorClass} group-hover:scale-110 transition-transform shadow-sm`}
    >
      <Icon size={20} />
    </div>
    <div>
      <h4 className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">
        {label}
      </h4>
      <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
    </div>
    <FiExternalLink className="ml-auto text-gray-300 group-hover:text-blue-400" size={12} />
  </button>
);

const QuickActions = () => {
  return (
    <div className="card bg-white border border-gray-100 shadow-sm rounded-2xl p-6 h-full flex flex-col">
      <div className="mb-6">
        <h3 className="font-bold text-gray-800 text-lg">Akses Cepat</h3>
        <p className="text-xs text-gray-500">Shortcut ke tools eksternal</p>
      </div>

      <div className="flex flex-col gap-3 h-full">
        <ActionBtn
          label="n8n Workflows"
          desc="Automasi workflow untuk chatbot"
          icon={SiN8N}
          colorClass="text-pink-600"
          bgClass="bg-pink-50"
          onClick={() => window.open("https://myjek-n8n.portproject.my.id/", "_blank")}
        />

        <ActionBtn
          label="MinIO Storage"
          desc="Manajemen File & Invoice"
          icon={FiDatabase}
          colorClass="text-red-500"
          bgClass="bg-red-50"
          onClick={() => window.open("https://myjek-storage.portproject.my.id/", "_blank")}
        />

        <ActionBtn
          label="WAHA Dashboard"
          desc="Cek Status Whatsapp API"
          icon={FiMessageCircle}
          colorClass="text-green-600"
          bgClass="bg-green-50"
          onClick={() => window.open("https://myjek-waha.portproject.my.id/dashboard", "_blank")}
        />

        <ActionBtn
          label="Chatbot MyJek"
          desc="Buka WA Web untuk chat dengan bot"
          icon={FaWhatsapp}
          colorClass="text-teal-600"
          bgClass="bg-teal-50"
          onClick={() => window.open("https://web.whatsapp.com", "_blank")}
        />
      </div>
    </div>
  );
};

export default QuickActions;
