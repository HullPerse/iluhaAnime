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
