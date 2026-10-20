import { isHexColor } from "@/lib/theme/palette.utils";
import { normalizeAutocompleteOpacity } from "@/lib/theme/tokens";
import type { ThemeComponents, ThemeDefinition, ThemeOverrides, ThemePatch } from "@/types/theme";

export interface ResolveThemeOptions {
  builtins: readonly ThemeDefinition[];
  customThemes?: readonly ThemeDefinition[];
  name: string;
  patch?: ThemePatch;
}

export function findTheme(
  name: string,
  builtins: readonly ThemeDefinition[],
  customThemes: readonly ThemeDefinition[] = []
): ThemeDefinition | undefined {
  return (
    builtins.find((theme) => theme.name === name) ??
    customThemes.find((theme) => theme.name === name)
  );
}

export function resolveTheme({
  builtins,
  customThemes = [],
  name,
  patch,
}: ResolveThemeOptions): ThemeDefinition | undefined {
  const base = findTheme(name, builtins, customThemes);
  if (!base || !patch) return base;

  return {
    ...base,
    bevel: patch.bevel ?? base.bevel,
    colors: { ...base.colors, ...patch.colors },
    components: patch.components ?? base.components,
    fontFamily: patch.fontFamily ?? base.fontFamily,
    overlay: patch.overlay ?? base.overlay,
    overrides: patch.overrides ?? base.overrides,
    radius: patch.radius ?? base.radius,
    titlebarGradient: patch.titlebarGradient ?? base.titlebarGradient,
  };
}

function sameOverrides(
  base: ThemeOverrides | undefined,
  draft: ThemeOverrides | undefined
): boolean {
  const left = base ?? {};
  const right = draft ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const token = key as keyof ThemeOverrides;
    if (left[token] !== right[token]) return false;
  }
  return true;
}

function sameComponents(
  base: ThemeComponents | undefined,
  draft: ThemeComponents | undefined
): boolean {
  return base?.titlebarArt === draft?.titlebarArt && base?.cardMeta === draft?.cardMeta;
}

function diffColors(
  base: ThemeDefinition["colors"],
  draft: ThemeDefinition["colors"]
): Partial<ThemeDefinition["colors"]> | undefined {
  const keys = new Set([...Object.keys(base), ...Object.keys(draft)]) as Set<
    keyof ThemeDefinition["colors"]
  >;
  const colors: Record<string, string | number | undefined> = {};
  for (const key of keys) {
    if (key === "autocompleteOpacity") {
      const baseOpacity = normalizeAutocompleteOpacity(base[key]);
      const draftOpacity = normalizeAutocompleteOpacity(draft[key]);
      if (baseOpacity !== draftOpacity) colors[key] = draftOpacity;
      continue;
    }
    if (key === "autocomplete") {
      const baseColor = isHexColor(base.autocomplete) ? base.autocomplete : base.muted;
      const draftColor = isHexColor(draft.autocomplete) ? draft.autocomplete : draft.muted;
      if (baseColor !== draftColor) colors[key] = draftColor;
      continue;
    }
    if (draft[key] !== base[key]) colors[key] = draft[key];
  }
  return Object.keys(colors).length > 0 ? colors : undefined;
}

function diffTrait<T>(base: T | undefined, draft: T | undefined, fallback: T): T | undefined {
  const effectiveBase = base ?? fallback;
  const effectiveDraft = draft ?? fallback;
  return effectiveDraft === effectiveBase ? undefined : effectiveDraft;
}

function diffComponents(
  base: ThemeComponents | undefined,
  draft: ThemeComponents | undefined
): ThemeComponents | undefined {
  if (sameComponents(base, draft)) return undefined;
  return draft ?? {};
}

function diffOverrides(
  base: ThemeOverrides | undefined,
  draft: ThemeOverrides | undefined
): ThemeOverrides | undefined {
  if (sameOverrides(base, draft)) return undefined;
  return draft ?? {};
}

function diffGradient(
  base: ThemeDefinition["titlebarGradient"],
  draft: ThemeDefinition["titlebarGradient"]
): ThemeDefinition["titlebarGradient"] | undefined {
  if (base?.from === draft?.from && base?.to === draft?.to) return undefined;
  return draft;
}

export function diffTheme(base: ThemeDefinition, draft: ThemeDefinition): ThemePatch | undefined {
  const patch: ThemePatch = {};

  const colors = diffColors(base.colors, draft.colors);
  if (colors) patch.colors = colors;

  const radius = diffTrait(base.radius, draft.radius, "none");
  if (radius) patch.radius = radius;

  const bevel = diffTrait(base.bevel, draft.bevel, "raised");
  if (bevel) patch.bevel = bevel;

  const overlay = diffTrait(base.overlay, draft.overlay, "none");
  if (overlay) patch.overlay = overlay;

  const components = diffComponents(base.components, draft.components);
  if (components) patch.components = components;

  const overrides = diffOverrides(base.overrides, draft.overrides);
  if (overrides) patch.overrides = overrides;

  const titlebarGradient = diffGradient(base.titlebarGradient, draft.titlebarGradient);
  if (titlebarGradient) patch.titlebarGradient = titlebarGradient;

  if (draft.fontFamily !== base.fontFamily && draft.fontFamily !== undefined) {
    patch.fontFamily = draft.fontFamily;
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}
