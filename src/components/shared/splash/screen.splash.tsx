import type { ComponentType } from "react";

import { resolveFatalVariant } from "@/config/fatal/screens.config";
import type { SplashStage } from "@/hooks/splash.hook";
import { resolveFatalLocale, resolveSplashTexts } from "@/lib/fatal/texts.utils";
import type { FatalVariant } from "@/types/fatal";

import { GenericSplash } from "./generic.splash";
import type { SplashVariantProps } from "./shared.splash";
import { Win7Splash } from "./win7.splash";
import { Win95Splash } from "./win95.splash";
import { XpSplash } from "./xp.splash";

export interface SplashScreenProps {
  stages: SplashStage[];
  themeName: string;
  safe?: boolean;
  fastLaunch: boolean;
  onToggleFastLaunch: () => void;
}

const VARIANTS: Record<FatalVariant, ComponentType<SplashVariantProps>> = {
  win95: Win95Splash,
  xp: XpSplash,
  win7: Win7Splash,
  generic: GenericSplash,
};

export function SplashScreen({
  stages,
  themeName,
  safe = false,
  fastLaunch,
  onToggleFastLaunch,
}: SplashScreenProps) {
  const variant = resolveFatalVariant(themeName, safe);
  const texts = resolveSplashTexts(resolveFatalLocale());
  const View = VARIANTS[variant];
  return (
    <View
      stages={stages}
      texts={texts}
      fastLaunch={fastLaunch}
      onToggleFastLaunch={onToggleFastLaunch}
    />
  );
}
