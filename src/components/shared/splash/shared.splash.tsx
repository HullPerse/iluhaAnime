import type { SplashStage } from "@/hooks/splash.hook";
import type { SplashTexts } from "@/lib/fatal/texts.utils";

export interface SplashVariantProps {
  stages: SplashStage[];
  texts: SplashTexts;
  fastLaunch: boolean;
  onToggleFastLaunch: () => void;
}

export function splashProgress(stages: SplashStage[]): number {
  if (stages.length === 0) return 0;
  const finished = stages.filter(
    (stage) => stage.status === "done" || stage.status === "degraded"
  ).length;
  return finished / stages.length;
}

export function splashStageLabel(texts: SplashTexts, id: string): string {
  if (id === "theme") return texts.theme;
  if (id === "migrations") return texts.migrations;
  if (id === "cache") return texts.cache;
  if (id === "database") return texts.database;
  if (id === "spelling") return texts.spelling;
  if (id === "index") return texts.index;
  return texts.tabs;
}
