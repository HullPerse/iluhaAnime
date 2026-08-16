import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import viteCompression from "vite-plugin-compression";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    sourcemap: false,
  },

  clearScreen: false,

  optimizeDeps: {
    include: ["d3-force"],
  },

  plugins: [
    react(),
    tailwindcss(),
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
    }),
  ],

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },

  server: {
    host: "127.0.0.1",
    port: 1420,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
    setupFiles: ["src/tests/test-setup.ts"],
  },
});
