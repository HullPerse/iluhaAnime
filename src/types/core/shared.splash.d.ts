import type { SplashStage } from "@/types/core/splash";
import type { SplashTexts } from "@/types/core/fatalTexts";

export interface SplashVariantProps {
  stages: SplashStage[];
  texts: SplashTexts;
  fastLaunch: boolean;
  onToggleFastLaunch: () => void;
}
