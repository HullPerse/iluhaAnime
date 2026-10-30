import { THEMES } from "@/config/graphics/themes.config";
import { useCell } from "@/lib/core/signal.hook";
import { resolveTheme } from "@/lib/graphics/themeResolve.utils";
import { themeAtoms } from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/graphics/theme";
import type { ResolvedThemeComponents } from "@/types/graphics/themeComponents";

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
