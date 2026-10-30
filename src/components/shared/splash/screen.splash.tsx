import type { ComponentType } from "react";

import { resolveSplashVariant } from "@/config/settings/screens.config";
import { resolveFatalLocale, resolveSplashTexts } from "@/lib/core/fatalTexts.utils";
import type { FatalVariant } from "@/types/core/fatal";

import { GenericSplash } from "@/components/shared/splash/generic.splash";
import { RetroismSplash } from "@/components/shared/splash/retroism.splash";
import type { SplashVariantProps } from "@/types/core/shared.splash";
import { TerminalSplash } from "@/components/shared/splash/terminal.splash";
import { Win7Splash } from "@/components/shared/splash/win7.splash";
import { Win95Splash } from "@/components/shared/splash/win95.splash";
import { XpSplash } from "@/components/shared/splash/xp.splash";
import { YorhaSplash } from "@/components/shared/splash/yorha.splash";
import type { SplashScreenProps } from "@/types/core/screen.splash";

const VARIANTS: Record<FatalVariant, ComponentType<SplashVariantProps>> = {
  win95: Win95Splash,
  xp: XpSplash,
  win7: Win7Splash,
  generic: GenericSplash,
  yorha: YorhaSplash,
  terminal: TerminalSplash,
  retroism: RetroismSplash,
};

export function SplashScreen({
  stages,
  themeName,
  safe = false,
  fastLaunch,
  onToggleFastLaunch,
}: SplashScreenProps) {
  const variant = resolveSplashVariant(themeName, safe);
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
