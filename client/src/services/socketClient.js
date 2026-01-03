import { io } from "socket.io-client";

// Inisialisasi Socket di luar komponen (Singleton)
// autoConnect: false -> Kita connect manual saat komponen butuh
export const socket = io("/", {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  autoConnect: false,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Helper untuk debugging
socket.on("connect", () => {
  console.log("✅ Socket Service Connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.warn("⚠️ Socket Service Disconnected:", reason);
});
