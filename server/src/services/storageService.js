import { Client } from "minio";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// ================================================================
// 1. KONFIGURASI MINIO
// ================================================================
const minioClient = new Client({
  endPoint: process.env.S3_ENDPOINT || "localhost",
  port: parseInt(process.env.S3_PORT || "9000"),
  useSSL: process.env.S3_USE_SSL === "true",
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "struk-belanja";

// Pastikan Bucket Ada saat startup
(async () => {
  try {
    if (!(await minioClient.bucketExists(BUCKET_NAME))) {
      await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
      console.log(`✅ Bucket '${BUCKET_NAME}' berhasil dibuat.`);
    }
  } catch (e) {
    console.log("⚠️ MinIO Init Warning: " + e.message);
  }
})();

export const storageService = {
  /**
   * DOWNLOAD DARI URL (WAHA) -> UPLOAD KE MINIO
   * Fungsi ini sekarang menyertakan API KEY agar tidak error 401
   */
  uploadFileFromUrl: async (sourceUrl, targetFilename) => {
    try {
      if (!sourceUrl || !sourceUrl.startsWith("http")) {
        throw new Error(`Invalid Source URL: ${sourceUrl}`);
      }

      console.log(`📥 Downloading stream from: ${sourceUrl}`);

      // --- PERBAIKAN UTAMA DISINI ---
      // Menyiapkan Header Auth jika download dari WAHA
      const axiosConfig = {
        url: sourceUrl,
        method: "GET",
        responseType: "stream",
        headers: {},
      };

      // Jika ada WAHA API KEY di .env, pasang di header
      if (process.env.WAHA_API_KEY) {
        axiosConfig.headers["X-Api-Key"] = process.env.WAHA_API_KEY;
        // console.log("🔑 Menggunakan API Key untuk download...");
      }

      // Download File
      const response = await axios(axiosConfig);

      // Upload ke MinIO
      await minioClient.putObject(BUCKET_NAME, targetFilename, response.data);

      console.log(`✅ Sukses upload ke MinIO: ${targetFilename}`);
      return targetFilename;
    } catch (error) {
      // Tampilkan error lebih detail
      const status = error.response ? error.response.status : "Unknown";
      const errMsg = error.message;
      console.error(`❌ Gagal Upload ke MinIO (Status: ${status}): ${errMsg}`);
      return null;
    }
  },

  /**
   * AMBIL BUFFER DARI MINIO
   * (Opsional: Dipakai jika suatu saat butuh kirim file manual)
   */
  getFileBuffer: async (fileName) => {
    try {
      const dataStream = await minioClient.getObject(BUCKET_NAME, fileName);
      const chunks = [];
      for await (const chunk of dataStream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error(`❌ Gagal ambil file '${fileName}' dari MinIO:`, error.message);
      return null;
    }
  },

  /**
   * GENERATE PRESIGNED URL (Opsional)
   */
  getPresignedUrl: async (filename) => {
    try {
      return await minioClient.presignedGetObject(BUCKET_NAME, filename, 3600);
    } catch (error) {
      return null;
    }
  },
};
