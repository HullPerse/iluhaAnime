const ISOLATED_TESTS = [
  "src/tests/lib/media.test.ts",
  "src/tests/lib/anilistNotifications.test.ts",
  "src/tests/components/player/side.player.test.tsx",
  "src/tests/components/player/modal.player.test.tsx",
  "src/tests/components/search/modern/dither/settings.dither.test.tsx",
  "src/tests/components/search/modern/dither/preview/modal.preview.test.tsx",
  "src/tests/components/collection/importAnilist.collection.test.tsx",
  "src/tests/lib/torrent.test.ts",
  "src/tests/components/collection/wizard/modal.wizard.test.tsx",
  "src/tests/lib/cardCache.utils.test.ts",
  "src/tests/hooks/collection/quickAdd.hook.test.tsx",
  "src/tests/hooks/discordPresence.hook.test.tsx",
  "src/tests/hooks/following.hook.test.tsx",
  "src/tests/hooks/game/session.hook.test.tsx",
  "src/tests/hooks/screen.hook.test.tsx",
  "src/tests/components/player/stream.player.test.tsx",
  "src/tests/lib/sessionCache.test.ts",
  "src/tests/hooks/player/discordPresence.hook.test.tsx",
  "src/tests/hooks/player/stream.hook.test.tsx",
  "src/tests/hooks/prewarmStream.hook.test.tsx",
  "src/tests/store/settings.store.test.ts",
  "src/tests/components/stream/episodes.stream.test.tsx",
  "src/tests/components/stream/detail.stream.test.tsx",
  "src/tests/lib/streamWarm.test.ts",
  "src/tests/routes/player.init.test.tsx",
  "src/tests/components/anilist/sort.anilist.test.tsx",
  "src/tests/lib/playerChrome.utils.test.ts",
  "src/tests/lib/playlist.utils.test.ts",
  "src/tests/lib/statsCalendar.utils.test.ts",
  "src/tests/lib/themeEditor.utils.test.ts",
];

export const SPLIT_GROUPS = [
  {
    name: "vendor-react",
    test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/u,
    priority: 40,
    minShareCount: 2,
  },
  {
    name: "vendor-zod",
    test: /node_modules[\\/]zod[\\/]/u,
    priority: 30,
    minShareCount: 2,
  },
  {
    name: "vendor-query",
    test: /node_modules[\\/]@tanstack[\\/]/u,
    priority: 30,
    minShareCount: 2,
  },
  {
    name: "vendor-base-ui",
    test: /node_modules[\\/](@base-ui|@floating-ui|use-sync-external-store)[\\/]/u,
    priority: 20,
    minShareCount: 2,
  },
  {
    name: "vendor-icons",
    test: /node_modules[\\/]lucide-react[\\/]/u,
    priority: 20,
    minShareCount: 2,
  },
  {
    name: "vendor-classes",
    test: /node_modules[\\/](cn|clsx|class-variance-authority)[\\/]/u,
    priority: 20,
    minShareCount: 2,
  },
  {
    name: "vendor-tauri",
    test: /node_modules[\\/]@tauri-apps[\\/]/u,
    priority: 20,
    minShareCount: 2,
  },
  {
    name: "vendor-hp",
    test: /node_modules[\\/]@hullperse[\\/]/u,
    priority: 20,
    minShareCount: 2,
  },
  {
    name: "locale-ru",
    test: /src[\\/]lib[\\/]locale[\\/]ru[\\/]/u,
    priority: 10,
    includeDependenciesRecursively: false,
  },
];

export const DEDUPE_MODULES = [
  "react",
  "react-dom",
  "@base-ui/react",
  "@base-ui/utils",
  "@floating-ui/react",
  "@floating-ui/react-dom",
  "@hullperse/hp_utils",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@tanstack/react-virtual",
  "@testing-library/react",
  "lucide-react",
  "use-sync-external-store",
];

export const OPTIMIZE_DEPS = ["d3-force"];

export const DEV_SERVER = {
  host: "127.0.0.1",
  port: 1420,
  strictPort: true,
  watch: {
    ignored: ["**/src-tauri/**"],
  },
};

export const COVERAGE_INCLUDE = ["src/lib/**", "src/store/**", "src/hooks/**", "src/config/**"];

export const COVERAGE_EXCLUDE = ["src/tests/**", "src/**/*.d.ts"];

export const TEST_PROJECTS = [
  {
    test: {
      name: "isolated",
      include: ISOLATED_TESTS,
    },
  },
  {
    test: {
      name: "shared",
      isolate: true,
      include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
      exclude: ISOLATED_TESTS,
    },
  },
];
