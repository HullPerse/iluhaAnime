import { DEFAULT_THEME_COLORS, THEMES, THEME_OVERRIDE_VARS } from "@/config/graphics/themes.config";
import type { Persistor } from "@/types/core/persist";
import { buildMirrorAtoms, createPersistedStoreContext } from "@/lib/core/persisted.utils";
import { isRecord } from "@/lib/core/record.utils";
import type { Cell } from "@/types/core/signal";
import { applyTheme } from "@/lib/core/appearance.utils";
import { deriveFieldColor, isHexColor } from "@/lib/graphics/palette.utils";
import { findTheme } from "@/lib/graphics/themeResolve.utils";
import { normalizeAutocompleteOpacity } from "@/lib/graphics/tokens.utils";
import { attemptSync } from "@/lib/core/attempt.utils";
import type {
  ThemeDefinition,
  ThemeOverrideKey,
  ThemePatch,
  ThemeStore,
} from "@/types/graphics/theme";

export const THEME_SCHEMA_VERSION = 1;

function parseRadius(value: unknown): ThemeDefinition["radius"] {
  return value === "frame" || value === "all" || value === "none" ? value : undefined;
}

function parseBevel(value: unknown): ThemeDefinition["bevel"] {
  return value === "flat" || value === "raised" ? value : undefined;
}

function parseOverlay(value: unknown): ThemeDefinition["overlay"] {
  return value === "scanlines" || value === "grid" || value === "none" ? value : undefined;
}

function parseComponents(value: unknown): ThemeDefinition["components"] {
  if (!isRecord(value)) return undefined;
  const components: NonNullable<ThemeDefinition["components"]> = {};
  if (value.titlebarArt === true) components.titlebarArt = true;
  if (value.cardMeta === "full" || value.cardMeta === "short") {
    components.cardMeta = value.cardMeta;
  }
  return Object.keys(components).length > 0 ? components : undefined;
}

function parseTitlebarGradient(value: unknown): ThemeDefinition["titlebarGradient"] {
  if (!isRecord(value)) return undefined;
  const from = value.from;
  const to = value.to;
  if (typeof from !== "string" || typeof to !== "string") return undefined;
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

function parseThemePatch(value: unknown): ThemePatch | undefined {
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

export type ParsedThemeFile =
  | { kind: "theme"; theme: ThemeDefinition }
  | { kind: "patch"; base: string; patch: ThemePatch };

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
  if (error !== null || !isRecord(raw)) return null;
  return parseRawTheme(raw, resolveBase);
}

export function parseThemeFile(
  json: string,
  resolveBase?: (name: string) => ThemeDefinition | undefined
): ParsedThemeFile | null {
  const [raw, error] = attemptSync((): unknown => JSON.parse(json));
  if (error !== null || !isRecord(raw)) return null;
  if (raw.format === "iluha-theme-patch") {
    if (raw.version !== 1) return null;
    if (typeof raw.base !== "string" || raw.base.length === 0) return null;
    const patch = parseThemePatch(raw.patch);
    return patch ? { kind: "patch", base: raw.base, patch } : null;
  }
  const theme = parseRawTheme(raw, resolveBase);
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

type ThemeActionKeys =
  | "addCustomTheme"
  | "removeCustomTheme"
  | "setTheme"
  | "setThemePatch"
  | "clearThemePatch";

export type ThemeData = Omit<ThemeStore, ThemeActionKeys>;
export type ThemeAtoms = { [K in keyof ThemeData]: Cell<ThemeData[K]> };

const DEFAULT_THEME_DATA: ThemeData = {
  currentTheme: "win95",
  customThemes: [],
  themePatches: {},
};

function readThemePatches(value: unknown): Record<string, ThemePatch> {
  if (!isRecord(value)) return {};
  const patches: Record<string, ThemePatch> = {};
  for (const [name, patch] of Object.entries(value)) {
    const parsed = parseThemePatch(patch);
    if (parsed) patches[name] = parsed;
  }
  return patches;
}

function migrateThemeData(data: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version >= THEME_SCHEMA_VERSION) return data;
  return { ...data, themePatches: {} };
}

function readLegacyTheme(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("themeState"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  return { data: state, schemaVersion: THEME_SCHEMA_VERSION };
}

export interface ThemeSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface ThemeSignalStore {
  atoms: ThemeAtoms;
  persistor: Persistor;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (name: string) => void;
  setTheme: (name: string) => void;
  setThemePatch: (name: string, patch: ThemePatch) => void;
  clearThemePatch: (name: string) => void;
}

export function createThemeSignalStore(options: ThemeSignalOptions = {}): ThemeSignalStore {
  const { store, persistor, adopted, finishAdopt } = createPersistedStoreContext({
    storeName: "theme",
    short: "theme",
    schemaVersion: THEME_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyTheme(get),
  });

  const persisted = persistor.read();
  const persistedData = migrateThemeData(
    persisted?.data ?? {},
    persisted?.schemaVersion ?? THEME_SCHEMA_VERSION
  );
  const storedThemes = Array.isArray(persistedData.customThemes)
    ? persistedData.customThemes.filter(
        (theme): theme is ThemeDefinition => isRecord(theme) && typeof theme.name === "string"
      )
    : [];
  const storedPatches = readThemePatches(persistedData.themePatches);
  const storedCurrent =
    typeof persistedData.currentTheme === "string"
      ? persistedData.currentTheme
      : DEFAULT_THEME_DATA.currentTheme;
  const data: ThemeData = {
    currentTheme:
      findTheme(storedCurrent, THEMES, storedThemes)?.name ?? DEFAULT_THEME_DATA.currentTheme,
    customThemes: storedThemes,
    themePatches: storedPatches,
  };
  const mirror: Record<string, unknown> = { ...data };
  const atoms = buildMirrorAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const applyCurrent = (name: string): void => {
    applyTheme(name, atoms.customThemes.get(), atoms.themePatches.get());
  };

  const handle: ThemeSignalStore = {
    atoms,
    persistor,
    addCustomTheme: (theme) => {
      const customThemes = atoms.customThemes.get();
      const existing = customThemes.find((t) => t.name === theme.name);
      atoms.customThemes.set(
        existing
          ? customThemes.map((t) => (t.name === theme.name ? theme : t))
          : [...customThemes, theme]
      );
    },
    removeCustomTheme: (name) => {
      const patches = { ...atoms.themePatches.get() };
      delete patches[name];
      atoms.themePatches.set(patches);
      atoms.customThemes.set(atoms.customThemes.get().filter((t) => t.name !== name));
      if (atoms.currentTheme.get() === name) {
        applyCurrent("win95");
        atoms.currentTheme.set("win95");
      }
    },
    setTheme: (name) => {
      applyCurrent(name);
      atoms.currentTheme.set(name);
    },
    setThemePatch: (name, patch) => {
      atoms.themePatches.set({ ...atoms.themePatches.get(), [name]: patch });
      if (atoms.currentTheme.get() === name) applyCurrent(name);
    },
    clearThemePatch: (name) => {
      const patches = { ...atoms.themePatches.get() };
      delete patches[name];
      atoms.themePatches.set(patches);
      if (atoms.currentTheme.get() === name) applyCurrent(name);
    },
  };

  if (adopted()) handle.setTheme(data.currentTheme);
  finishAdopt(() => ({ ...mirror }), { remove: "themeState" });
  if (!adopted()) {
    applyCurrent(data.currentTheme);
  }

  return handle;
}

const theme = createThemeSignalStore();

export const themeAtoms = theme.atoms;
export const themePersistor = theme.persistor;
export const addCustomTheme = theme.addCustomTheme;
export const removeCustomTheme = theme.removeCustomTheme;
export const setTheme = theme.setTheme;
export const setThemePatch = theme.setThemePatch;
export const clearThemePatch = theme.clearThemePatch;

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => theme.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") theme.persistor.flush();
  });
}
