import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    server: {
      proxy: {
        "/api": {
          target:
            mode === "development" ? "http://localhost:5000" : "https://myjek-api.mmsdashboard.dev",
          changeOrigin: true,
          secure: mode !== "development",
          ws: true,
        },
        "/socket.io": {
          target:
            mode === "development" ? "http://localhost:5000" : "https://myjek-api.mmsdashboard.dev",
          changeOrigin: true,
          secure: mode !== "development",
          ws: true, // Wajib true untuk WebSocket
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()],
  };
});
