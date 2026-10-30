import type { SplashStage } from "@/types/splash";
import type { SplashTexts } from "@/types/fatalTexts";

export interface SplashVariantProps {
  stages: SplashStage[];
  texts: SplashTexts;
  fastLaunch: boolean;
  onToggleFastLaunch: () => void;
}
