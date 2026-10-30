import type { SplashStage } from "@/types/splash";

export interface SplashScreenProps {
  stages: SplashStage[];
  themeName: string;
  safe?: boolean;
  fastLaunch: boolean;
  onToggleFastLaunch: () => void;
}
