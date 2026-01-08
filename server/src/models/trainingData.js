import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const TrainingData = sequelize.define("training_data", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_question: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "Pertanyaan atau chat dari user",
  },
  admin_answer: {
    type: DataTypes.TEXT,
    allowNull: true, // Allow null karena mungkin admin belum jawab
    comment: "Jawaban ideal yang diketik manual oleh Admin",
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: "WHATSAPP_HANDOFF",
  },
});

export default TrainingData;
