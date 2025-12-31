import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const User = sequelize.define(
  "users",
  {
    phone: {
      type: DataTypes.STRING(20),
      primaryKey: true,
      allowNull: false,
    },
    device_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // ID Perangkat (254...)
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    address_text: DataTypes.TEXT,
    latitude: { type: DataTypes.FLOAT, allowNull: true },
    longitude: { type: DataTypes.FLOAT, allowNull: true },
    last_order_date: DataTypes.DATE,
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default User;
