import { FiPlus } from "react-icons/fi";

const PageHeader = ({ title, description, btnLabel, onBtnClick }) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        {description && <p className="text-gray-500 text-sm mt-1">{description}</p>}
      </div>

      {btnLabel && (
        <button
          onClick={onBtnClick}
          className="btn bg-[#f14c06] hover:bg-[#d14306] text-white border-none rounded-xl gap-2 shadow-lg shadow-orange-200/50 transition-transform transform hover:scale-105"
        >
          <FiPlus size={18} /> {btnLabel}
        </button>
      )}
    </div>
  );
};

export default PageHeader;
