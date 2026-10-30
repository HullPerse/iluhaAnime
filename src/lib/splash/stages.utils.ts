import type { SplashTexts } from "@/types/core/fatalTexts";
import type { SplashStage } from "@/types/core/splash";

export const splashProgress = (stages: SplashStage[]): number => {
  if (stages.length === 0) return 0;
  const finished = stages.filter(
    (stage) => stage.status === "done" || stage.status === "degraded"
  ).length;
  return finished / stages.length;
};

export const stageMarker = (status: string): string => {
  if (status === "done") return "[  OK  ]";
  if (status === "degraded") return "[ FAIL ]";
  if (status === "active") return "[  ..  ]";
  return "[  --  ]";
};

export const splashStageLabel = (texts: SplashTexts, id: string): string => {
  if (id === "theme") return texts.theme;
  if (id === "migrations") return texts.migrations;
  if (id === "cache") return texts.cache;
  if (id === "database") return texts.database;
  if (id === "spelling") return texts.spelling;
  if (id === "index") return texts.index;
  return texts.tabs;
};
