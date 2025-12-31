import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Courier = sequelize.define(
  "couriers",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(20),
      unique: true,
      allowNull: false,
    },
    device_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // ID Perangkat (254...) untuk login via WA Web
    },
    shift_code: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "1=Pagi, 2=Sore",
    },
    status: {
      type: DataTypes.ENUM("OFFLINE", "IDLE", "BUSY", "SUSPEND"),
      defaultValue: "OFFLINE",
    },
    current_order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Lokasi Kurir Real-time
    current_latitude: { type: DataTypes.FLOAT },
    current_longitude: { type: DataTypes.FLOAT },

    // Digunakan untuk algoritma prioritas pembagian order (Siapa paling lama nganggur)
    last_active_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    last_job_time: {
      type: DataTypes.DATE,
      defaultValue: "2000-01-01 00:00:00",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["status", "shift_code"] }, { fields: ["last_active_at"] }],
  }
);

export default Courier;
