import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/index.css";

import { DbScreen } from "@/components/shared/db/screen.db";
import { FatalScreen } from "@/components/shared/fatal/screen.fatal";
import { SplashScreen } from "@/components/shared/splash/screen.splash";
import type { SplashStage } from "@/hooks/splash.hook";
import { applyTheme } from "@/store/theme.store";
import type { FatalKind } from "@/types/fatal";

const FIXED_TIME = 1754000000000;

const FATAL_MOCKS: Record<FatalKind, { message: string; stack: string; scope: string }> = {
  chunk: {
    message: "Failed to fetch dynamically imported module: ./assets/collection.route-Ab12Cd.js",
    stack: "ChunkLoadError: Failed to fetch dynamically imported module",
    scope: "render",
  },
  render: {
    message: "Cannot read properties of undefined (reading 'map')",
    stack: "TypeError: Cannot read properties of undefined (reading 'map')",
    scope: "render",
  },
  startup: {
    message: "Root element not found",
    stack: "Error: Root element not found",
    scope: "startup",
  },
  "global-loop": {
    message: "Unhandled rejection: get_torrent_info failed: timeout after 30000ms",
    stack: "Error: get_torrent_info failed: timeout after 30000ms",
    scope: "global-loop",
  },
};

const SPLASH_STAGES: SplashStage[] = [
  { id: "theme", status: "done" },
  { id: "cache", status: "active" },
  { id: "tabs", status: "pending" },
];

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function ScreensApp() {
  const screen = readParam("screen") ?? "fatal";
  const theme = readParam("theme") ?? "win95";
  const kind = (readParam("kind") as FatalKind | null) ?? "chunk";
  applyTheme(theme, []);

  if (screen === "db") {
    return (
      <DbScreen
        error="open app database: file is not a database"
        themeName={theme}
        dataDir="C:/Users/test/AppData/Roaming/iluhaAnime"
        onRetry={() => {}}
        onReload={() => {}}
        onOpenFolder={() => {}}
      />
    );
  }

  if (screen === "splash") {
    return (
      <SplashScreen
        stages={SPLASH_STAGES}
        themeName={theme}
        fastLaunch={false}
        onToggleFastLaunch={() => {}}
      />
    );
  }

  const mock = FATAL_MOCKS[kind] ?? FATAL_MOCKS.chunk;
  return (
    <FatalScreen
      info={{
        kind,
        message: mock.message,
        stack: mock.stack,
        scope: mock.scope,
        themeName: theme,
        route: "/collection",
        timestamp: FIXED_TIME,
        retryCount: 0,
      }}
      onReload={() => {}}
      onSafeReload={() => {}}
      onRetry={() => {}}
    />
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("Screens root element not found");
createRoot(root).render(
  <StrictMode>
    <ScreensApp />
  </StrictMode>
);
