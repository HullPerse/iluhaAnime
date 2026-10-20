import { THEMES } from "@/config/settings/themes.config";
import { useCell } from "@/lib/state/signal.hook";
import { resolveTheme } from "@/lib/theme/resolve";
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
  const patches = useCell(themeAtoms.themePatches);
  const theme = resolveTheme({
    builtins: THEMES,
    customThemes: custom,
    name: current,
    patch: patches[current],
  });
  return resolveThemeComponents(theme);
}
