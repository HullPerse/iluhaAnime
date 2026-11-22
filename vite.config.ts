import { readdir, stat, readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import {
  COVERAGE_EXCLUDE,
  COVERAGE_INCLUDE,
  DEDUPE_MODULES,
  DEV_SERVER,
  OPTIMIZE_DEPS,
  SPLIT_GROUPS,
  TEST_PROJECTS,
} from "./src/config/vite.shared.config.ts";

export default defineConfig({
  build: {
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        const id = log.id ?? "";
        const isCompilerRuntime =
          id.includes("react-compiler-runtime") || log.message.includes("react-compiler-runtime");

        if (log.code === "MODULE_LEVEL_DIRECTIVE" && isCompilerRuntime) return;
        defaultHandler(level, log);
      },
      output: {
        codeSplitting: {
          groups: [...SPLIT_GROUPS],
        },
      },
    },
    sourcemap: false,
  },

  clearScreen: false,

  optimizeDeps: {
    include: OPTIMIZE_DEPS,
  },

  plugins: [
    react(),
    tailwindcss(),
    {
      name: "config-dev-override",
      apply: "serve",
      async load(id) {
        if (!id.endsWith(".data.json")) return null;
        const overridePath = resolve(import.meta.dirname, "config.local.json");
        let overrides: Record<string, Record<string, unknown>> = {};

        try {
          overrides = JSON.parse(await readFile(overridePath, "utf-8"));
        } catch {
          return null;
        }

        const base = basename(id);
        const fileOverride = overrides[base];

        if (!fileOverride || typeof fileOverride !== "object") return null;
        let original: Record<string, unknown>;

        try {
          original = JSON.parse(await readFile(id, "utf-8"));
        } catch {
          return null;
        }

        const merged = { ...original, ...fileOverride };

        return `export default ${JSON.stringify(merged)}`;
      },
    },
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
    dedupe: DEDUPE_MODULES,
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },

  server: DEV_SERVER,

  test: {
    environment: "jsdom",
    setupFiles: ["src/tests/setup.ts"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: COVERAGE_INCLUDE,
      exclude: COVERAGE_EXCLUDE,
    },
    projects: TEST_PROJECTS,
  },
});
