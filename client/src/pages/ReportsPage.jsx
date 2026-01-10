import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchDashboardData, fetchTransactions } from "../features/reportSlice";

// Import Modular Components
import ReportFilter from "../components/reports/ReportFilter";
import SummaryCards from "../components/reports/SummaryCards";
import RevenueChart from "../components/reports/RevenueChart";
import TransactionTable from "../components/reports/TransactionTable";
import PageHeader from "../components/common/PageHeader";

const ReportsPage = () => {
  const dispatch = useDispatch();
  const { summary, chartData, transactions, filters, isLoading } = useSelector(
    (state) => state.reports
  );

  // Effect: Ambil data setiap kali Filter Tanggal berubah
  useEffect(() => {
    if (filters.startDate && filters.endDate) {
      dispatch(fetchDashboardData());
      dispatch(fetchTransactions(1)); // Reset ke page 1
    }
  }, [dispatch, filters.startDate, filters.endDate]);

  // Handler Pagination
  const handlePageChange = (newPage) => {
    dispatch(fetchTransactions(newPage));
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <PageHeader
        title="Laporan Transaksi"
        description="Analisa performa bisnis dan unduh rekap transaksi"
      />

      {/* 1. Filter Section */}
      <ReportFilter />

      {isLoading ? (
        // Skeleton Loading Sederhana
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      ) : (
        <>
          {/* 2. Statistik Cards */}
          <SummaryCards summary={summary} />

          {/* 3. Grafik Area */}
          <RevenueChart data={chartData} />

          {/* 4. Tabel Transaksi */}
          <TransactionTable
            transactions={transactions.items}
            page={transactions.currentPage}
            totalPages={transactions.totalPages}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
};

export default ReportsPage;
