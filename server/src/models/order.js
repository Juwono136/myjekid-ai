import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Order = sequelize.define(
  "orders",
  {
    order_id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
    // Foreign Keys didefinisikan di asosiasi bawah, tapi field perlu ada
    user_phone: { type: DataTypes.STRING(20), allowNull: false },
    courier_id: { type: DataTypes.UUID, allowNull: true }, // Mengikuti tipe UUID Courier

    raw_message: DataTypes.TEXT,
    items_summary: DataTypes.JSONB, // Sesuai kebutuhan JSON data

    invoice_image_url: DataTypes.TEXT,
    total_amount: {
      type: DataTypes.DECIMAL(12, 0), // Menyimpan angka presisi uang
      defaultValue: 0,
    },

    pickup_address: {
      type: DataTypes.TEXT,
      allowNull: true, // Boleh kosong jika bukan food delivery
    },

    delivery_address: DataTypes.TEXT,

    status: {
      type: DataTypes.ENUM(
        "DRAFT",
        "PENDING_CONFIRMATION",
        "LOOKING_FOR_DRIVER",
        "ON_PROCESS",
        "BILL_VALIDATION",
        "BILL_SENT",
        "COMPLETED",
        "CANCELLED"
      ),
      defaultValue: "DRAFT",
    },
    completed_at: DataTypes.DATE,
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Order;
