import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false, // Set true jika ingin melihat raw SQL di terminal
  timezone: "+07:00", // WIB
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully.");

    // Sinkronisasi Tabel (Alter: update struktur jika ada perubahan, tanpa hapus data)
    // Di Production nanti sebaiknya pakai Migrations.
    await sequelize.sync({ alter: true });
    console.log("✅ Database Models Synced.");
  } catch (error) {
    console.error("❌ Database Connection Failed:", error);
    process.exit(1);
  }
};

export { sequelize, connectDB };
