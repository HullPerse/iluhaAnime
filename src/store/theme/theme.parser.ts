import * as z from "zod/mini";

import { DEFAULT_THEME_COLORS, THEME_OVERRIDE_VARS } from "@/config/graphics/themes.config";
import { isRecord } from "@/lib/core/text/record.utils";
import { deriveFieldColor, isHexColor } from "@/lib/graphics/palette.utils";
import { normalizeAutocompleteOpacity } from "@/lib/graphics/tokens.utils";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import type {
  ParsedThemeFile,
  ThemeDefinition,
  ThemeOverrideKey,
  ThemePatch,
} from "@/types/graphics/theme";

const RadiusSchema = z.compile(z.enum(["frame", "all", "none"]));
const BevelSchema = z.compile(z.enum(["flat", "raised"]));
const ModeSchema = z.compile(z.enum(["dark", "light"]));
const OverlaySchema = z.compile(z.enum(["none", "scanlines", "grid"]));
const TitlebarGradientSchema = z.compile(z.object({ from: z.string(), to: z.string() }));
const ComponentsSchema = z.compile(
  z.object({
    titlebarArt: z.optional(z.boolean()),
    cardMeta: z.optional(z.enum(["full", "short"])),
  })
);
const RecordSchema = z.compile(z.record(z.string(), z.unknown()));
const PatchEnvelopeSchema = z.compile(
  z.object({
    format: z.literal("iluha-theme-patch"),
    version: z.literal(1),
    base: z.string().check(z.refine((value) => value.length > 0)),
    patch: z.unknown(),
  })
);

function parseRadius(value: unknown): ThemeDefinition["radius"] {
  const r = RadiusSchema.safeParse(value);
  return r.success ? r.data : undefined;
}

function parseBevel(value: unknown): ThemeDefinition["bevel"] {
  const r = BevelSchema.safeParse(value);
  return r.success ? r.data : undefined;
}

function parseMode(value: unknown): ThemeDefinition["mode"] {
  const r = ModeSchema.safeParse(value);
  return r.success ? r.data : undefined;
}

function parseOverlay(value: unknown): ThemeDefinition["overlay"] {
  const r = OverlaySchema.safeParse(value);
  return r.success ? r.data : undefined;
}

function parseComponents(value: unknown): ThemeDefinition["components"] {
  const r = ComponentsSchema.safeParse(value);
  if (!r.success) return undefined;
  const components: NonNullable<ThemeDefinition["components"]> = {};
  if (r.data.titlebarArt === true) components.titlebarArt = true;
  if (r.data.cardMeta !== undefined) components.cardMeta = r.data.cardMeta;
  return Object.keys(components).length > 0 ? components : undefined;
}

function parseTitlebarGradient(value: unknown): ThemeDefinition["titlebarGradient"] {
  const r = TitlebarGradientSchema.safeParse(value);
  if (!r.success) return undefined;
  const from = r.data.from;
  const to = r.data.to;
  if (!/^#[\da-f]{6}$/i.test(from) || !/^#[\da-f]{6}$/i.test(to)) return undefined;
  return { from, to };
}

function isThemeOverrideKey(value: string): value is ThemeOverrideKey {
  return value in THEME_OVERRIDE_VARS;
}

function parseOverrides(value: unknown): ThemeDefinition["overrides"] {
  if (!isRecord(value)) return undefined;
  const overrides: Partial<Record<ThemeOverrideKey, string>> = {};
  for (const key of Object.keys(THEME_OVERRIDE_VARS)) {
    const color = value[key];
    if (isThemeOverrideKey(key) && isHexColor(color)) overrides[key] = color;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function themeToJson(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

function firstString(c: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = c[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function pickString(c: Record<string, unknown>, keys: string[], fallback: string): string {
  const found = firstString(c, keys);
  return typeof found === "string" ? found : fallback;
}

type ThemeColors = ThemeDefinition["colors"];

function inheritedColor(base: ThemeColors | undefined, key: keyof ThemeColors): string | undefined {
  const value = base?.[key];
  return typeof value === "string" ? value : undefined;
}

function readColor(
  c: Record<string, unknown>,
  keys: string[],
  base: ThemeColors | undefined,
  key: keyof ThemeColors,
  fallback: string
): string {
  return pickString(c, keys, inheritedColor(base, key) ?? fallback);
}

function parseRetroismColors(c: Record<string, unknown>, base?: ThemeColors): ThemeColors | null {
  if (!base && !c.base && !c.primary) return null;
  const muted = readColor(c, ["muted", "shadow"], base, "muted", DEFAULT_THEME_COLORS.muted);
  const primary = readColor(c, ["primary", "base"], base, "primary", DEFAULT_THEME_COLORS.primary);
  const fieldInput = firstString(c, ["field", "input"]);
  const inheritedAutocomplete = inheritedColor(base, "autocomplete");
  const autocomplete = isHexColor(c.autocomplete)
    ? c.autocomplete
    : (inheritedAutocomplete ?? muted);
  const inheritedOpacity = base?.autocompleteOpacity;
  let autocompleteOpacity = DEFAULT_THEME_COLORS.autocompleteOpacity;
  if (c.autocompleteOpacity !== undefined)
    autocompleteOpacity = normalizeAutocompleteOpacity(c.autocompleteOpacity);
  else if (typeof inheritedOpacity === "number") autocompleteOpacity = inheritedOpacity;
  return {
    autocomplete,
    autocompleteOpacity,
    background: readColor(c, ["background"], base, "background", DEFAULT_THEME_COLORS.background),
    destructive: readColor(
      c,
      ["destructive", "urgent"],
      base,
      "destructive",
      DEFAULT_THEME_COLORS.destructive
    ),
    field:
      fieldInput !== undefined
        ? deriveFieldColor(fieldInput, primary)
        : (inheritedColor(base, "field") ?? deriveFieldColor(undefined, primary)),
    highlight: readColor(c, ["highlight"], base, "highlight", DEFAULT_THEME_COLORS.highlight),
    linkHover: readColor(
      c,
      ["link_hover", "linkHover"],
      base,
      "linkHover",
      DEFAULT_THEME_COLORS.linkHover
    ),
    muted,
    primary,
    secondary: readColor(
      c,
      ["secondary", "accent"],
      base,
      "secondary",
      DEFAULT_THEME_COLORS.secondary
    ),
    success: readColor(c, ["success"], base, "success", DEFAULT_THEME_COLORS.success),
    surface: readColor(c, ["surface"], base, "surface", DEFAULT_THEME_COLORS.surface),
    text: readColor(c, ["text"], base, "text", DEFAULT_THEME_COLORS.text),
    winHighlight: readColor(
      c,
      ["win_highlight", "winHighlight", "highlight"],
      base,
      "winHighlight",
      DEFAULT_THEME_COLORS.winHighlight
    ),
    winShadow: readColor(
      c,
      ["win_shadow", "winShadow", "shadow"],
      base,
      "winShadow",
      DEFAULT_THEME_COLORS.winShadow
    ),
  };
}

function mergeComponents(
  base: ThemeDefinition["components"],
  child: ThemeDefinition["components"]
): ThemeDefinition["components"] {
  if (!base && !child) return undefined;
  return { ...base, ...child };
}

function mergeOverrides(
  base: ThemeDefinition["overrides"],
  child: ThemeDefinition["overrides"]
): ThemeDefinition["overrides"] {
  if (!base && !child) return undefined;
  const merged = { ...base, ...child };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function pickTrait<T>(value: T | undefined, fallback: T | undefined): T | undefined {
  return value === undefined ? fallback : value;
}

function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

function setPatchColor<K extends Exclude<keyof ThemeColors, "autocompleteOpacity">>(
  colors: NonNullable<ThemePatch["colors"]>,
  key: K,
  value: unknown
): void {
  if (isHexColor(value)) colors[key] = value;
}

function parsePatchColors(value: unknown): ThemePatch["colors"] | undefined {
  if (!isRecord(value)) return undefined;
  const colors: NonNullable<ThemePatch["colors"]> = {};
  if (typeof value.autocompleteOpacity === "number" && Number.isFinite(value.autocompleteOpacity)) {
    colors.autocompleteOpacity = normalizeAutocompleteOpacity(value.autocompleteOpacity);
  }
  setPatchColor(colors, "autocomplete", value.autocomplete);
  setPatchColor(colors, "background", value.background);
  setPatchColor(colors, "destructive", value.destructive);
  setPatchColor(colors, "field", value.field);
  setPatchColor(colors, "highlight", value.highlight);
  setPatchColor(colors, "linkHover", value.linkHover);
  setPatchColor(colors, "muted", value.muted);
  setPatchColor(colors, "primary", value.primary);
  setPatchColor(colors, "secondary", value.secondary);
  setPatchColor(colors, "success", value.success);
  setPatchColor(colors, "surface", value.surface);
  setPatchColor(colors, "text", value.text);
  setPatchColor(colors, "winHighlight", value.winHighlight);
  setPatchColor(colors, "winShadow", value.winShadow);
  return Object.keys(colors).length > 0 ? colors : undefined;
}

function parsePatchComponents(value: unknown): ThemeDefinition["components"] {
  if (!isRecord(value)) return undefined;
  const components: NonNullable<ThemeDefinition["components"]> = {};
  if (typeof value.titlebarArt === "boolean") components.titlebarArt = value.titlebarArt;
  if (value.cardMeta === "full" || value.cardMeta === "short") {
    components.cardMeta = value.cardMeta;
  }
  return Object.keys(components).length > 0 ? components : undefined;
}

export function parseThemePatch(value: unknown): ThemePatch | undefined {
  if (!isRecord(value)) return undefined;
  const record = value;
  const patch: ThemePatch = {};

  const colors = parsePatchColors(record.colors);
  if (colors) patch.colors = colors;
  const radius = parseRadius(record.radius);
  if (radius) patch.radius = radius;
  const bevel = parseBevel(record.bevel);
  if (bevel) patch.bevel = bevel;
  const overlay = parseOverlay(record.overlay);
  if (overlay) patch.overlay = overlay;
  const components = parsePatchComponents(record.components);
  if (components) patch.components = components;
  else if (isRecord(record.components) && Object.keys(record.components).length === 0) {
    patch.components = {};
  }
  const gradient = parseTitlebarGradient(record.titlebarGradient);
  if (gradient) patch.titlebarGradient = gradient;
  const overrides = parseOverrides(record.overrides);
  if (overrides) patch.overrides = overrides;
  else if (isRecord(record.overrides) && Object.keys(record.overrides).length === 0) {
    patch.overrides = {};
  }
  if (typeof record.fontFamily === "string" && record.fontFamily.length > 0) {
    patch.fontFamily = record.fontFamily;
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

export function themePatchToJson(base: string, patch: ThemePatch): string {
  return JSON.stringify({ format: "iluha-theme-patch", version: 1, base, patch }, null, 2);
}

function parseRawTheme(
  raw: Record<string, unknown>,
  resolveBase?: (name: string) => ThemeDefinition | undefined
): ThemeDefinition | null {
  const extendsName =
    typeof raw.extends === "string" && raw.extends.length > 0 ? raw.extends : undefined;
  if (extendsName === undefined) return buildParsedTheme(raw, undefined);
  const base = resolveBase?.(extendsName);
  if (!base) return null;
  return buildParsedTheme(raw, base);
}

export function parseRetroismTheme(
  json: string,
  resolveBase?: (name: string) => ThemeDefinition | undefined
): ThemeDefinition | null {
  const [raw, error] = attemptSync((): unknown => JSON.parse(json));
  if (error !== null) return null;
  const recordResult = RecordSchema.safeParse(raw);
  if (!recordResult.success) return null;
  return parseRawTheme(recordResult.data, resolveBase);
}

export function parseThemeFile(
  json: string,
  resolveBase?: (name: string) => ThemeDefinition | undefined
): ParsedThemeFile | null {
  const [raw, error] = attemptSync((): unknown => JSON.parse(json));
  if (error !== null) return null;
  const recordResult = RecordSchema.safeParse(raw);
  if (!recordResult.success) return null;
  const record = recordResult.data;
  if (record.format === "iluha-theme-patch") {
    const envelopeResult = PatchEnvelopeSchema.safeParse(record);
    if (!envelopeResult.success) return null;
    const patch = parseThemePatch(envelopeResult.data.patch);
    return patch ? { kind: "patch", base: envelopeResult.data.base, patch } : null;
  }
  const theme = parseRawTheme(record, resolveBase);
  return theme ? { kind: "theme", theme } : null;
}

function buildParsedTheme(
  raw: Record<string, unknown>,
  base: ThemeDefinition | undefined
): ThemeDefinition | null {
  const c = isRecord(raw.colors) ? raw.colors : raw;
  const colors = parseRetroismColors(c, base?.colors);
  if (!colors) return null;
  const fontValue = raw.fontFamily ?? c.font_family;
  const fontFamily = typeof fontValue === "string" ? fontValue : undefined;
  return {
    bevel: pickTrait(parseBevel(raw.bevel), base?.bevel),
    colors,
    components: mergeComponents(base?.components, parseComponents(raw.components)),
    fontFamily: pickTrait(fontFamily, base?.fontFamily),
    label: String(firstValue(raw.label, raw.name, base?.label, "Imported")),
    mode: pickTrait(parseMode(raw.mode), base?.mode),
    name: String(firstValue(raw.name, `custom-${Date.now()}`)),
    overlay: pickTrait(parseOverlay(raw.overlay), base?.overlay),
    overrides: mergeOverrides(base?.overrides, parseOverrides(raw.overrides)),
    radius: pickTrait(parseRadius(raw.radius), base?.radius),
    titlebarGradient: pickTrait(
      parseTitlebarGradient(raw.titlebarGradient),
      base?.titlebarGradient
    ),
  };
}
