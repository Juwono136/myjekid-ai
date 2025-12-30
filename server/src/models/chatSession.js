import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const ChatSession = sequelize.define(
  "chat_sessions",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      unique: true, // Satu user hanya boleh punya 1 sesi aktif
      allowNull: false,
    },
    mode: {
      type: DataTypes.ENUM("BOT", "HUMAN"),
      defaultValue: "BOT",
    },
    is_paused_until: {
      type: DataTypes.DATE, // Timestamp kapan bot boleh bangun lagi
      allowNull: true,
    },
    last_interaction: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    updatedAt: false,
    createdAt: "created_at",
  }
);

export default ChatSession;
