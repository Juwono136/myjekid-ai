import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  // Jika hanya 1 halaman, sembunyikan pagination agar bersih
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-100 gap-4">
      <p className="text-xs text-gray-500 order-2 sm:order-1">
        Halaman <span className="font-bold text-gray-800">{currentPage}</span> dari {totalPages}
      </p>

      <div className="join order-1 sm:order-2 shadow-sm">
        <button
          className="join-item btn btn-sm bg-white border-gray-200 hover:bg-gray-50 text-gray-600 disabled:bg-gray-50"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <FiChevronLeft /> Prev
        </button>

        <button className="join-item btn btn-sm bg-[#f14c06] text-white border-none pointer-events-none">
          {currentPage}
        </button>

        <button
          className="join-item btn btn-sm bg-white border-gray-200 hover:bg-gray-50 text-gray-600 disabled:bg-gray-50"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next <FiChevronRight />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
