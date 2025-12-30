import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const TrainingData = sequelize.define("training_data", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_question: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "Pertanyaan atau chat dari user",
  },
  admin_answer: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "Jawaban ideal yang diketik manual oleh Admin",
  },
  category: {
    type: DataTypes.STRING, // Contoh: "ORDER", "COMPLAINT", "UNKNOWN"
    allowNull: true,
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: "WHATSAPP_HANDOFF",
  },
});

export default TrainingData;
