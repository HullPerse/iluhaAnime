import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { imagetools } from "vite-imagetools";
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
    imagetools({
      cache: {
        enabled: true,
        dir: "node_modules/.cache/vite-imagetools",
      },
    }),
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
    }),
    {
      name: "icon-sprite",
      apply: "build",
      async buildStart() {
        try {
          const dir = resolve(import.meta.dirname, "./src/assets/icons");
          const files = await readdir(dir);

          let total = 0;

          for (const f of files) {
            const s = await stat(join(dir, f));
            total += s.size;
          }
          this.info?.(`icon-sprite: ${files.length} icons, ${(total / 1024).toFixed(1)}KB`);
        } catch {
        }
      },
    },
  ],

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },

  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
    setupFiles: ["src/tests/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/lib/**", "src/store/**", "src/hooks/**", "src/config/**"],
      exclude: ["src/tests/**", "src/**/*.d.ts"],
    },
  },
});
