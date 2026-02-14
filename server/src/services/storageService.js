import { Client } from "minio";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// KONFIGURASI MINIO
const minioClient = new Client({
  endPoint: process.env.S3_ENDPOINT || "localhost",
  port: parseInt(process.env.S3_PORT || "9000"),
  useSSL: process.env.S3_USE_SSL === "true",
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "myjek-receipts";

/** Download URL ke base64 (satu kali unduh, untuk dipakai AI + upload MinIO). */
const getBase64FromUrl = async (url) => {
  try {
    const headers = {};
    if (process.env.WAHA_API_KEY) headers["X-Api-Key"] = process.env.WAHA_API_KEY;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers,
    });
    return Buffer.from(response.data, "binary").toString("base64");
  } catch (error) {
    console.error(`Gagal download gambar dari URL: ${error.message}`);
    return null;
  }
};

// Pastikan Bucket Ada saat startup
(async () => {
  try {
    if (!(await minioClient.bucketExists(BUCKET_NAME))) {
      await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
      console.log(`✅ Bucket '${BUCKET_NAME}' berhasil dibuat.`);
    }
  } catch (e) {
    console.log("MinIO Init Warning: " + e.message);
  }
})();

export const storageService = {
  getBase64FromUrl,

  // DOWNLOAD DARI URL (WAHA) -> UPLOAD KE MINIO
  // Digunakan jika gambar dikirim berupa Link (http://...)
  uploadFileFromUrl: async (sourceUrl, targetFilename) => {
    try {
      if (!sourceUrl || !sourceUrl.startsWith("http")) {
        throw new Error(`Invalid Source URL: ${sourceUrl}`);
      }

      console.log(`📥 Downloading stream from: ${sourceUrl}`);

      // Menyiapkan Header
      const axiosConfig = {
        url: sourceUrl,
        method: "GET",
        responseType: "stream",
        headers: {},
      };

      if (process.env.WAHA_API_KEY) {
        axiosConfig.headers["X-Api-Key"] = process.env.WAHA_API_KEY;
        // console.log("🔑 Menggunakan API Key untuk download...");
      }

      // Download File
      const response = await axios(axiosConfig);

      // Upload ke MinIO
      await minioClient.putObject(BUCKET_NAME, targetFilename, response.data);

      console.log(`✅ Sukses upload URL ke MinIO: ${targetFilename}`);
      return targetFilename;
    } catch (error) {
      const status = error.response ? error.response.status : "Unknown";
      const errMsg = error.message;
      console.error(`Gagal Upload URL ke MinIO (Status: ${status}): ${errMsg}`);
      return null;
    }
  },

  // UPLOAD DARI BASE64
  // Digunakan jika gambar dikirim berupa kode teks panjang (Raw Image Data)
  uploadBase64: async (base64String, targetFilename) => {
    try {
      // Bersihkan prefix data URI jika ada (cth: data:image/jpeg;base64,...)
      const cleanString = base64String.replace(/^data:image\/\w+;base64,/, "");

      // Ubah string base64 menjadi Buffer (Binary Data)
      const buffer = Buffer.from(cleanString, "base64");

      // Upload Buffer ke MinIO
      await minioClient.putObject(BUCKET_NAME, targetFilename, buffer);

      console.log(`✅ Sukses upload Base64 ke MinIO: ${targetFilename}`);
      return targetFilename;
    } catch (error) {
      console.error(`❌ Gagal Upload Base64 ke MinIO: ${error.message}`);
      return null;
    }
  },

  // AMBIL BUFFER DARI MINIO
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

  downloadFileAsBase64: async (fileName) => {
    try {
      // Pastikan bucket ada
      const fileStat = await minioClient.statObject(BUCKET_NAME, fileName);
      if (!fileStat) throw new Error("File tidak ditemukan di MinIO");

      const stream = await minioClient.getObject(BUCKET_NAME, fileName);

      // Baca stream menjadi Buffer
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Validasi buffer tidak kosong
      if (buffer.length === 0) {
        throw new Error("Buffer kosong setelah download dari MinIO");
      }

      // Return raw base64 string (tanpa prefix dulu)
      return buffer.toString("base64");
    } catch (error) {
      console.error(`❌ MinIO Download Error (${fileName}):`, error.message);
      return null;
    }
  },

  // GENERATE PRESIGNED URL (Opsional)
  getPresignedUrl: async (filename) => {
    try {
      return await minioClient.presignedGetObject(BUCKET_NAME, filename, 3600);
    } catch (error) {
      return null;
    }
  },
};
