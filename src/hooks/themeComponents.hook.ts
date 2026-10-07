import { THEMES } from "@/config/settings/themes.config";
import { useCell } from "@/lib/state/signal.hook";
import { themeAtoms } from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

export interface ResolvedThemeComponents {
  titlebarArt: boolean;
  cardMeta: "full" | "short";
}

export function resolveThemeComponents(
  theme: ThemeDefinition | undefined
): ResolvedThemeComponents {
  return {
    titlebarArt: theme?.components?.titlebarArt === true,
    cardMeta: theme?.components?.cardMeta ?? "full",
  };
}

export function useThemeComponents(): ResolvedThemeComponents {
  const current = useCell(themeAtoms.currentTheme);
  const custom = useCell(themeAtoms.customThemes);
  const theme =
    THEMES.find((item) => item.name === current) ?? custom.find((item) => item.name === current);
  return resolveThemeComponents(theme);
}
