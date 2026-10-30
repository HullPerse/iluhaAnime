import { DEFAULT_THEME_COLORS } from "@/config/graphics/themes.config";
import { mixHex } from "@/lib/graphics/palette.utils";
import { diffTheme } from "@/lib/graphics/themeResolve.utils";
import { addCustomTheme, clearThemePatch, setTheme, setThemePatch } from "@/store/theme.store";
import type { TranslationKey } from "@/types/core/i18n";
import type {
  ThemeColorKey,
  ThemeComponents,
  ThemeDefinition,
  ThemeOverrideKey,
} from "@/types/graphics/theme";

export const DEFAULT_COLORS: ThemeDefinition["colors"] = { ...DEFAULT_THEME_COLORS };

export const OVERRIDE_ROWS: {
  key: ThemeOverrideKey;
  label: TranslationKey;
  fallback: (colors: ThemeDefinition["colors"]) => string;
}[] = [
  { key: "progressMain", label: "settings.theme.override.progress", fallback: (c) => c.secondary },
  {
    key: "torrentDownloading",
    label: "settings.theme.override.torrent.downloading",
    fallback: () => "#0000ff",
  },
  {
    key: "torrentSeeding",
    label: "settings.theme.override.torrent.seeding",
    fallback: () => "#f97316",
  },
  {
    key: "torrentDone",
    label: "settings.theme.override.torrent.done",
    fallback: () => "#008000",
  },
  {
    key: "torrentError",
    label: "settings.theme.override.torrent.error",
    fallback: () => "#800000",
  },
  {
    key: "torrentInitializing",
    label: "settings.theme.override.torrent.initializing",
    fallback: () => "#0891b2",
  },
  {
    key: "torrentIdle",
    label: "settings.theme.override.torrent.idle",
    fallback: () => "#808080",
  },
  {
    key: "torrentMissing",
    label: "settings.theme.override.torrent.missing",
    fallback: () => "#b8860b",
  },
  {
    key: "favGold",
    label: "settings.theme.override.fav",
    fallback: () => "#facc15",
  },
  {
    key: "graphDefault",
    label: "settings.theme.override.graph.default",
    fallback: (c) => c.muted,
  },
  {
    key: "graphLight",
    label: "settings.theme.override.graph.light",
    fallback: (c) => mixHex(c.text, c.muted, 0.45),
  },
  {
    key: "graphPale",
    label: "settings.theme.override.graph.pale",
    fallback: (c) => c.surface,
  },
  {
    key: "graphPrequel",
    label: "settings.theme.override.graph.prequel",
    fallback: (c) => c.destructive,
  },
  {
    key: "graphSequel",
    label: "settings.theme.override.graph.sequel",
    fallback: (c) => c.highlight,
  },
  {
    key: "graphSide",
    label: "settings.theme.override.graph.side",
    fallback: (c) => c.success,
  },
  {
    key: "graphSpinoff",
    label: "settings.theme.override.graph.spinoff",
    fallback: (c) => c.linkHover,
  },
];

export function buildComponents(
  titlebarArt: boolean,
  cardMeta: NonNullable<ThemeComponents["cardMeta"]>
): ThemeComponents | undefined {
  const components: ThemeComponents = {};
  if (titlebarArt) components.titlebarArt = true;
  if (cardMeta !== "full") components.cardMeta = cardMeta;
  return Object.keys(components).length > 0 ? components : undefined;
}

export function buildThemeName(
  name: string,
  theme: ThemeDefinition | undefined,
  patchMode: boolean,
  baseTheme: ThemeDefinition | undefined
): string {
  if (patchMode && baseTheme) return baseTheme.name;
  return theme?.name ?? `custom-${name.trim().toLowerCase().replaceAll(/\s+/g, "-")}`;
}

export function saveTheme(
  draft: ThemeDefinition,
  currentTheme: string,
  patchMode: boolean,
  baseTheme: ThemeDefinition | undefined
): void {
  if (patchMode && baseTheme) {
    const patch = diffTheme(baseTheme, draft);
    if (patch) setThemePatch(baseTheme.name, patch);
    else clearThemePatch(baseTheme.name);
    return;
  }
  addCustomTheme(draft);
  if (currentTheme === draft.name) setTheme(draft.name);
}

export function editorHeaderKey(patchMode: boolean, isEdit: boolean): TranslationKey {
  if (patchMode) return "settings.theme.customize";
  if (isEdit) return "settings.theme.edit.title";
  return "settings.theme.create.title";
}

export type { ThemeColorKey };
