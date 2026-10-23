import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
    setupFiles: ["src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/lib/**", "src/store/**", "src/hooks/**", "src/config/**"],
      exclude: ["src/tests/**", "src/**/*.d.ts"],
    },
    projects: [
      {
        test: {
          // Files with behavior-divergent `vi.mock("@/...")` for src
          // modules. With a shared registry the first-evaluated factory
          // would freeze its mock into every other file of the worker, so
          // these keep per-file isolation.
          name: "isolated",
          include: [
            "src/tests/lib/utils/media.test.ts",
            "src/tests/lib/anilist/notifications.test.ts",
            "src/tests/components/player/side.player.test.tsx",
            "src/tests/components/search/modern/dither/settings.dither.test.tsx",
            "src/tests/components/search/modern/dither/preview/modal.preview.test.tsx",
            "src/tests/components/collection/importAnilist.collection.test.tsx",
            "src/tests/lib/torrent.test.ts",
            "src/tests/components/collection/wizard/modal.wizard.test.tsx",
            "src/tests/lib/cardCache.utils.test.ts",
            "src/tests/hooks/collection/quickAdd.hook.test.tsx",
            "src/tests/hooks/game/session.hook.test.tsx",
            "src/tests/hooks/screen.hook.test.tsx",
          ],
        },
      },
      {
        test: {
          // Everything else shares one module registry per worker. Safe
          // because all Tauri mocks funnel through `src/tests/mocks.ts` and
          // the global `beforeEach` in `src/tests/setup.ts` restores
          // fresh-mock semantics per test.
          name: "shared",
          isolate: false,
          include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
          exclude: [
            "src/tests/lib/utils/media.test.ts",
            "src/tests/lib/anilist/notifications.test.ts",
            "src/tests/components/player/side.player.test.tsx",
            "src/tests/components/search/modern/dither/settings.dither.test.tsx",
            "src/tests/components/search/modern/dither/preview/modal.preview.test.tsx",
            "src/tests/components/collection/importAnilist.collection.test.tsx",
            "src/tests/lib/torrent.test.ts",
            "src/tests/components/collection/wizard/modal.wizard.test.tsx",
            "src/tests/lib/cardCache.utils.test.ts",
            "src/tests/hooks/collection/quickAdd.hook.test.tsx",
            "src/tests/hooks/game/session.hook.test.tsx",
            "src/tests/hooks/screen.hook.test.tsx",
          ],
        },
      },
    ],
  },
});
