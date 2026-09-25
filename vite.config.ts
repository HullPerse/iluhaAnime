import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        // react-compiler-runtime ships "use no memo" via @videojs deps. No compiler pass runs over the bundle, so the drop is safe.
        const id = log.id ?? "";
        const isCompilerRuntime =
          id.includes("react-compiler-runtime") || log.message.includes("react-compiler-runtime");
        if (log.code === "MODULE_LEVEL_DIRECTIVE" && isCompilerRuntime) {
          return;
        }
        defaultHandler(level, log);
      },
    },
    sourcemap: false,
  },

  clearScreen: false,

  optimizeDeps: {
    include: ["d3-force"],
  },

  plugins: [
    react(),
    tailwindcss(),
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
        } catch {}
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
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/lib/**", "src/store/**", "src/hooks/**", "src/config/**"],
      exclude: ["src/tests/**", "src/**/*.d.ts"],
    },
  },
});
