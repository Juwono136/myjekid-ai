import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Order = sequelize.define(
  "orders",
  {
    order_id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
    short_code: {
      type: DataTypes.STRING(12),
      allowNull: true,
      unique: true,
    },
    user_phone: { type: DataTypes.STRING(20), allowNull: false },
    courier_id: { type: DataTypes.UUID, allowNull: true },

    raw_message: DataTypes.TEXT,
    items_summary: DataTypes.JSONB,
    order_notes: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },

    invoice_image_url: DataTypes.TEXT,
    total_amount: {
      type: DataTypes.DECIMAL(12, 0), // Menyimpan angka presisi uang
      defaultValue: 0,
    },

    pickup_address: {
      type: DataTypes.TEXT,
      allowNull: true, // Boleh kosong jika bukan food delivery
    },
    pickup_latitude: { type: DataTypes.DOUBLE, allowNull: true },
    pickup_longitude: { type: DataTypes.DOUBLE, allowNull: true },

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

    offered_courier_ids: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: "Daftar courier id yang sudah ditawari order (untuk timeout 3 menit per kurir)",
    },
    last_offered_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["status"] },
      { fields: ["status", "created_at"] },
      { fields: ["user_phone"] },
      { fields: ["user_phone", "status"] },
    ],
  }
);

export default Order;
