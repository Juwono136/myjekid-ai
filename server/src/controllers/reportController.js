import { Op } from "sequelize";
import { Order, User, Courier, sequelize } from "../models/index.js";
import logger from "../utils/logger.js";
import ExcelJS from "exceljs";

// Date Filter
const getDateFilter = (startDate, endDate) => {
  if (!startDate || !endDate) return {};

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  return {
    created_at: {
      [Op.between]: [start, end],
    },
  };
};

// Get report summary
export const getReportSummary = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    // Filter Status: Hanya yang COMPLETED dihitung sebagai Omzet
    const completedFilter = {
      status: "COMPLETED",
      ...dateFilter,
    };

    // Total Revenue
    const totalRevenue = await Order.sum("total_amount", {
      where: completedFilter,
    });

    // Total Transactions (Jumlah Order Sukses)
    const totalTransactions = await Order.count({
      where: completedFilter,
    });

    // Cancelled Orders
    const totalCancelled = await Order.count({
      where: {
        status: "CANCELLED",
        ...dateFilter,
      },
    });

    // Average Order Value
    const avgOrderValue =
      totalTransactions > 0 ? Math.round((totalRevenue || 0) / totalTransactions) : 0;

    res.status(200).json({
      status: "success",
      data: {
        totalRevenue: parseInt(totalRevenue) || 0,
        totalTransactions,
        totalCancelled,
        avgOrderValue,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get revenue chart
export const getRevenueChart = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    // Menggunakan date_trunc (PostgreSQL) untuk grouping per hari
    const chartData = await Order.findAll({
      attributes: [
        [sequelize.fn("date_trunc", "day", sequelize.col("created_at")), "date"],
        [sequelize.fn("sum", sequelize.col("total_amount")), "revenue"],
        [sequelize.fn("count", sequelize.col("order_id")), "count"],
      ],
      where: {
        ...dateFilter,
        status: "COMPLETED",
      },
      group: [sequelize.fn("date_trunc", "day", sequelize.col("created_at"))],
      order: [[sequelize.col("date"), "ASC"]],
    });

    const formattedData = chartData.map((item) => ({
      date: item.get("date"),
      revenue: parseInt(item.get("revenue")) || 0,
      count: parseInt(item.get("count")) || 0,
    }));

    res.status(200).json({
      status: "success",
      data: formattedData,
    });
  } catch (error) {
    next(error);
  }
};

// Get transaction reports
export const getTransactionReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = "", status, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    // Base Filter
    const whereClause = {
      ...getDateFilter(startDate, endDate),
    };

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause[Op.or] = [
        // Cari di kolom order_id (Case Insensitive)
        { order_id: { [Op.iLike]: `%${search}%` } },
        // Cari di kolom nama user
        { "$user.name$": { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Order.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ["name", "phone"],
        },
        {
          model: Courier,
          attributes: ["name", "phone", "shift_code"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
      distinct: true,
    });

    res.status(200).json({
      status: "success",
      data: {
        items: rows,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
      },
    });
  } catch (error) {
    logger.error(`Error Transaction Report: ${error.message}`);
    next(error);
  }
};

// Export to excel
export const exportTransactionReport = async (req, res, next) => {
  try {
    const { search = "", status, startDate, endDate } = req.query;

    const whereClause = {
      ...getDateFilter(startDate, endDate),
    };

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause[Op.or] = [
        { order_id: { [Op.iLike]: `%${search}%` } },
        { "$user.name$": { [Op.iLike]: `%${search}%` } },
      ];
    }

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        { model: User, attributes: ["name", "phone"] },
        { model: Courier, attributes: ["name", "phone"] },
      ],
      order: [["created_at", "DESC"]],
    });

    // Setup Workbook & Worksheet Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Laporan Transaksi");

    // Definisi Header Kolom
    worksheet.columns = [
      { header: "No", key: "no", width: 5 },
      { header: "Order ID", key: "order_id", width: 20 },
      { header: "Tanggal", key: "date", width: 15 },
      { header: "Waktu", key: "time", width: 10 },
      { header: "Nama User", key: "user_name", width: 20 },
      { header: "No. HP User", key: "user_phone", width: 15 },
      { header: "Kurir", key: "courier_name", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Total (Rp)", key: "amount", width: 15 },
    ];

    // Styling Header (Bold & Background Abu)
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F81BD" },
    };

    // Isi Data (Looping)
    let totalRevenue = 0;

    orders.forEach((order, index) => {
      const dateObj = new Date(order.created_at);

      // Hitung Total khusus yang Completed
      if (order.status === "COMPLETED") {
        totalRevenue += Number(order.total_amount);
      }

      worksheet.addRow({
        no: index + 1,
        order_id: order.order_id,
        date: dateObj.toLocaleDateString("id-ID"),
        time: dateObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        user_name: order.user?.name || "Deleted User",
        user_phone: order.user_phone,
        courier_name: order.courier?.name || "-",
        status: order.status,
        amount: Number(order.total_amount),
      });
    });

    // Styling Kolom Amount (Currency Format)
    worksheet.getColumn(9).numFmt = '"Rp" #,##0';

    // Tambahkan Baris Grand Total di Paling Bawah
    const lastRowIndex = orders.length + 2; // +1 Header, +1 Baris Baru
    const totalRow = worksheet.getRow(lastRowIndex);

    totalRow.values = [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "GRAND TOTAL (Sukses):",
      totalRevenue,
    ];

    // Style Baris Total
    totalRow.font = { bold: true };
    totalRow.getCell(8).alignment = { horizontal: "right" };
    totalRow.getCell(9).numFmt = '"Rp" #,##0';
    totalRow.getCell(9).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" }, // Warna Kuning Stabilo
    };

    // Kirim Response sebagai File Stream
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Laporan_Transaksi_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error(`Excel Export Error: ${error.message}`);
    next(error);
  }
};
