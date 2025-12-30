import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Admin = sequelize.define(
  "admins",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
      validate: { isEmail: true },
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    full_name: DataTypes.STRING(100),
    role: {
      type: DataTypes.ENUM("CS", "SUPER_ADMIN"),
      defaultValue: "CS",
    },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_login: DataTypes.DATE,
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Admin;
