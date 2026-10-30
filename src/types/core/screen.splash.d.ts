import type { SplashStage } from "@/types/core/splash";

export interface SplashScreenProps {
  stages: SplashStage[];
  themeName: string;
  safe?: boolean;
  fastLaunch: boolean;
  onToggleFastLaunch: () => void;
}
