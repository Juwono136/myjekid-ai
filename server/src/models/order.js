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

    chat_messages: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: "Seluruh pesan chat pelanggan yang di-forward ke kurir",
    },

    invoice_image_url: DataTypes.TEXT,
    total_amount: {
      type: DataTypes.DECIMAL(12, 0),
      defaultValue: 0,
    },
    /** Total dari baca struk (OCR); jika kurir revisi, total_amount bisa berbeda. */
    receipt_total: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: true,
    },

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
    taken_at: { type: DataTypes.DATE, allowNull: true },

    offered_courier_ids: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: "Daftar courier id yang sudah ditawari order",
    },
    last_offered_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    getterMethods: {
      items_summary() { return []; },
      pickup_address() { return ""; },
      delivery_address() { return ""; },
      order_notes() { return []; },
      raw_message() { return (this.chat_messages && this.chat_messages[0]) ? String(this.chat_messages[0]) : ""; },
    },
    indexes: [
      { fields: ["status"] },
      { fields: ["status", "created_at"] },
      { fields: ["user_phone"] },
      { fields: ["user_phone", "status"] },
      { fields: ["courier_id"] },
    ],
  }
);

export default Order;
