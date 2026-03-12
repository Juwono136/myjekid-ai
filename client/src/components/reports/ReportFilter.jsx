import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiDownload, FiCalendar, FiX } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { setFilters, downloadReportExcel } from "../../features/reportSlice";
import { useState } from "react";

const ReportFilter = () => {
  const dispatch = useDispatch();
  const { filters, isDownloading } = useSelector((state) => state.reports);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Convert String ISO kembali ke Date Object untuk DatePicker
  const startDateObj = filters.startDate ? new Date(filters.startDate) : null;
  const endDateObj = filters.endDate ? new Date(filters.endDate) : null;

  const handleDateChange = (dates) => {
    const [start, end] = dates;

    // Convert Date Object ke String ISO sebelum kirim ke Redux
    dispatch(
      setFilters({
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null,
      })
    );
  };

  const handleExportClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmExport = () => {
    setShowConfirmModal(false);
    dispatch(downloadReportExcel());
  };

  return (
    <>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        {/* Date Picker Section */}
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Periode Laporan
          </label>
          <div className="flex items-center gap-3 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-blue-400 transition-colors cursor-pointer group w-full md:w-75">
            <FiCalendar
              className="text-gray-400 group-hover:text-blue-500 transition-colors"
              size={18}
            />
            <DatePicker
              selected={startDateObj}
              onChange={handleDateChange}
              startDate={startDateObj}
              endDate={endDateObj}
              selectsRange
              dateFormat="dd MMM yyyy"
              className="bg-transparent border-none outline-none text-sm font-semibold text-gray-700 w-full cursor-pointer placeholder-gray-400"
              placeholderText="Pilih rentang tanggal"
            />
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleExportClick}
          disabled={!filters.startDate || !filters.endDate || isDownloading}
          className={`
            flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-sm
            ${
              !filters.startDate || !filters.endDate
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600 text-white hover:shadow-emerald-200 hover:shadow-lg active:scale-95"
            }
          `}
        >
          {isDownloading ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <FiDownload size={18} />
          )}
          <span>Export Excel</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal modal-open bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="modal-box max-w-md rounded-2xl shadow-2xl border border-gray-100 p-0 overflow-hidden">
            <div className="bg-emerald-500 px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <FiDownload size={20} /> Konfirmasi Export
              </h3>
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="btn btn-sm btn-circle btn-ghost text-white hover:bg-white/20"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-6">
                Apakah Anda yakin ingin mengunduh laporan transaksi dalam format Excel untuk periode yang dipilih?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="btn px-5 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 rounded-xl font-medium"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmExport}
                  className="btn bg-emerald-500 hover:bg-emerald-600 border-none text-white px-5 py-2.5 rounded-xl font-medium"
                >
                  Ya, Unduh Excel
                </button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop bg-black/30" onClick={() => setShowConfirmModal(false)} aria-hidden="true" />
        </div>
      )}
    </>
  );
};

export default ReportFilter;
