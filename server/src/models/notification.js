import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Notification = sequelize.define(
  "notifications",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM("HUMAN_HANDOFF", "SYSTEM", "ORDER_ALERT"),
      defaultValue: "SYSTEM",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    reference_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Bisa berisi Order ID atau No HP User (tergantung konteks)",
    },
    action_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL untuk redirect admin saat notif diklik",
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Notification;
