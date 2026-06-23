import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
  ],

  clearScreen: false,
  build: {
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },

  server: {
    port: 1420,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
