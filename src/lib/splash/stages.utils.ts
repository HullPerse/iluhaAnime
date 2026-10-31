import type { SplashTexts } from "@/types/core/fatalTexts";
import type { SplashStage } from "@/types/core/splash";

export const splashProgress = (stages: SplashStage[]): number => {
  if (stages.length === 0) return 0;
  const finished = stages.filter(
    (stage) => stage.status === "done" || stage.status === "degraded"
  ).length;
  return finished / stages.length;
};

const STAGE_MARKERS: Partial<Record<string, string>> = {
  active: "[  ..  ]",
  degraded: "[ FAIL ]",
  done: "[  OK  ]",
};

const STAGE_TEXT_KEYS: Record<string, keyof SplashTexts> = {
  cache: "cache",
  database: "database",
  index: "index",
  migrations: "migrations",
  spelling: "spelling",
  theme: "theme",
};

export const stageMarker = (status: string): string => STAGE_MARKERS[status] ?? "[  --  ]";

export const splashStageLabel = (texts: SplashTexts, id: string): string => {
  const key = STAGE_TEXT_KEYS[id];
  return key ? texts[key] : texts.tabs;
};
