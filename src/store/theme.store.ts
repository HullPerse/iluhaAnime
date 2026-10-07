import { DEFAULT_THEME_COLORS, THEMES, THEME_OVERRIDE_VARS } from "@/config/settings/themes.config";
import { createPersistor, persistKey, type Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import {
  contrastRatio,
  deriveFieldColor,
  hexToRgb,
  windowTintAlpha,
} from "@/lib/theme/palette.utils";
import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { DEFAULT_FONT_FAMILY, getStoredAppFont, toCssFontFamily } from "@/lib/utils/font.utils";
import type { ThemeDefinition, ThemeOverrideKey, ThemeStore } from "@/types/theme";

export const THEME_SCHEMA_VERSION = 0;

export function getTitleText(color: string): string {
  if (hexToRgb(color) === null) return "#ffffff";
  const dark = contrastRatio(color, "#000000");
  const light = contrastRatio(color, "#ffffff");
  return dark >= light ? "#000000" : "#ffffff";
}

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
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const components: NonNullable<ThemeDefinition["components"]> = {};
  if (record.titlebarArt === true) components.titlebarArt = true;
  if (record.cardMeta === "full" || record.cardMeta === "short")
    components.cardMeta = record.cardMeta;
  return Object.keys(components).length > 0 ? components : undefined;
}

function parseTitlebarGradient(value: unknown): ThemeDefinition["titlebarGradient"] {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (!/^#[\da-f]{6}$/i.test(String(record.from)) || !/^#[\da-f]{6}$/i.test(String(record.to))) {
    return undefined;
  }
  return { from: String(record.from), to: String(record.to) };
}

function parseOverrides(value: unknown): ThemeDefinition["overrides"] {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const overrides: Partial<Record<ThemeOverrideKey, string>> = {};
  for (const key of Object.keys(THEME_OVERRIDE_VARS) as ThemeOverrideKey[]) {
    const color = record[key];
    if (typeof color === "string" && /^#[\da-f]{6}$/i.test(color)) overrides[key] = color;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function parseAutocompleteOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function findTheme(name: string, custom: ThemeDefinition[]): ThemeDefinition | undefined {
  return THEMES.find((t) => t.name === name) ?? custom.find((t) => t.name === name);
}

function applyThemeDatasets(root: HTMLElement, theme: ThemeDefinition): void {
  if (!root.dataset) return;
  root.dataset.theme = theme.name;
  root.dataset.radius = theme.radius ?? "none";
  root.dataset.bevel = theme.bevel ?? "raised";
  root.dataset.themeOverlay = theme.overlay ?? "none";
  root.dataset.themeTitlebarArt = theme.components?.titlebarArt === true ? "on" : "off";
}

export function applyTheme(name: string, customThemes: ThemeDefinition[] = []) {
  const theme = findTheme(name, customThemes);
  if (!theme) return;
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  const c = theme.colors;
  const autocomplete = parseHexColor(c.autocomplete, c.muted);
  const autocompleteOpacity = parseAutocompleteOpacity(c.autocompleteOpacity);
  const titleText = getTitleText(c.secondary);
  root.style.setProperty("--color-background", c.background, "important");
  root.style.setProperty("--color-primary", c.primary, "important");
  root.style.setProperty("--color-secondary", c.secondary, "important");
  root.style.setProperty("--color-text", c.text, "important");
  root.style.setProperty("--color-muted", c.muted, "important");
  root.style.setProperty("--color-autocomplete", autocomplete, "important");
  root.style.setProperty("--autocomplete-opacity", String(autocompleteOpacity), "important");
  root.style.setProperty("--color-highlight", c.highlight, "important");
  root.style.setProperty("--color-destructive", c.destructive, "important");
  root.style.setProperty("--color-success", c.success, "important");
  root.style.setProperty("--color-link-hover", c.linkHover, "important");
  root.style.setProperty("--color-surface", c.surface, "important");
  root.style.setProperty("--color-field", deriveFieldColor(c.field, c.primary), "important");
  root.style.setProperty("--color-win-highlight", c.winHighlight, "important");
  root.style.setProperty("--color-win-shadow", c.winShadow, "important");
  root.style.setProperty("--color-title-text", titleText, "important");
  root.style.setProperty(
    "--titlebar-from",
    theme.titlebarGradient?.from ?? c.secondary,
    "important"
  );
  root.style.setProperty("--titlebar-to", theme.titlebarGradient?.to ?? c.secondary, "important");
  const windowAlpha = `${Math.round(windowTintAlpha(c.primary, c.text) * 100)}%`;
  root.style.setProperty("--ui-window-alpha", windowAlpha, "important");

  for (const key of Object.keys(THEME_OVERRIDE_VARS) as ThemeOverrideKey[]) {
    const variable = THEME_OVERRIDE_VARS[key];
    const override = theme.overrides?.[key];
    if (override === undefined) root.style.removeProperty(variable);
    else root.style.setProperty(variable, override, "important");
  }
  applyThemeDatasets(root, theme);
  const storedAppFont = getStoredAppFont();
  const fontCss = storedAppFont
    ? toCssFontFamily(storedAppFont)
    : (theme.fontFamily ?? DEFAULT_FONT_FAMILY);
  root.style.setProperty("--font-family", fontCss, "important");

  const [, serializeError] = attemptSync(() =>
    localStorage.setItem(
      "themeVars",
      JSON.stringify({
        autocomplete,
        autocompleteOpacity,
        background: c.background,
        destructive: c.destructive,
        field: c.field,
        fontFamily: theme.fontFamily ?? null,
        highlight: c.highlight,
        linkHover: c.linkHover,
        muted: c.muted,
        primary: c.primary,
        secondary: c.secondary,
        success: c.success,
        surface: c.surface,
        text: c.text,
        themeName: theme.name,
        titleText,
        winHighlight: c.winHighlight,
        winShadow: c.winShadow,
        windowAlpha,
      })
    )
  );
  if (serializeError !== null) reportBackgroundError("theme.serialize", serializeError);
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

function parseRetroismColors(c: Record<string, unknown>): ThemeDefinition["colors"] | null {
  if (!c.base && !c.primary) return null;
  const muted = pickString(c, ["muted", "shadow"], DEFAULT_THEME_COLORS.muted);
  const primary = pickString(c, ["primary", "base"], DEFAULT_THEME_COLORS.primary);
  return {
    background: pickString(c, ["background"], DEFAULT_THEME_COLORS.background),
    destructive: pickString(c, ["destructive", "urgent"], DEFAULT_THEME_COLORS.destructive),
    field: deriveFieldColor(firstString(c, ["field", "input"]), primary),
    highlight: pickString(c, ["highlight"], DEFAULT_THEME_COLORS.highlight),
    linkHover: pickString(c, ["link_hover", "linkHover"], DEFAULT_THEME_COLORS.linkHover),
    muted,
    autocomplete: parseHexColor(c.autocomplete, muted),
    autocompleteOpacity: parseAutocompleteOpacity(c.autocompleteOpacity),
    primary,
    secondary: pickString(c, ["secondary", "accent"], DEFAULT_THEME_COLORS.secondary),
    success: pickString(c, ["success"], DEFAULT_THEME_COLORS.success),
    surface: pickString(c, ["surface"], DEFAULT_THEME_COLORS.surface),
    text: pickString(c, ["text"], DEFAULT_THEME_COLORS.text),
    winHighlight: pickString(
      c,
      ["win_highlight", "winHighlight", "highlight"],
      DEFAULT_THEME_COLORS.winHighlight
    ),
    winShadow: pickString(c, ["win_shadow", "winShadow", "shadow"], DEFAULT_THEME_COLORS.winShadow),
  };
}

export function parseRetroismTheme(json: string): ThemeDefinition | null {
  const [raw, error] = attemptSync(() => JSON.parse(json) as Record<string, unknown>);
  if (error !== null) return null;
  const c = (raw.colors ?? raw) as Record<string, unknown>;
  const colors = parseRetroismColors(c);
  if (!colors) return null;
  return {
    bevel: parseBevel(raw.bevel),
    colors,
    components: parseComponents(raw.components),
    fontFamily: (raw.fontFamily ?? c.font_family) as string | undefined,
    label: (raw.label ?? raw.name ?? "Imported") as string,
    name: (raw.name ?? `custom-${Date.now()}`) as string,
    overlay: parseOverlay(raw.overlay),
    overrides: parseOverrides(raw.overrides),
    radius: parseRadius(raw.radius),
    titlebarGradient: parseTitlebarGradient(raw.titlebarGradient),
  };
}

type ThemeActionKeys = "addCustomTheme" | "removeCustomTheme" | "setTheme";

export type ThemeData = Omit<ThemeStore, ThemeActionKeys>;
export type ThemeAtoms = { [K in keyof ThemeData]: Cell<ThemeData[K]> };

const DEFAULT_THEME_DATA: ThemeData = {
  currentTheme: "win95",
  customThemes: [],
};

function readLegacyTheme(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("themeState"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  if (!state || typeof state !== "object") return null;
  return { data: state as Record<string, unknown>, schemaVersion: THEME_SCHEMA_VERSION };
}

function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
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
}

export function createThemeSignalStore(options: ThemeSignalOptions = {}): ThemeSignalStore {
  const getStorage = options.getStorage ?? defaultGetStorage;
  const store = createSignalStore();
  let adoptedFromLegacy = false;
  const persistor = createPersistor({
    storeName: "theme",
    schemaVersion: THEME_SCHEMA_VERSION,
    getStorage,
    debounceMs: options.debounceMs,
    fallback: () => {
      const migrated = readLegacyTheme(getStorage);
      if (migrated) adoptedFromLegacy = true;
      return migrated;
    },
    onError: (scope, error) => reportBackgroundError(`theme.signal.${scope}`, error as Error),
  });

  const persisted = persistor.read();
  const persistedData = (persisted?.data ?? {}) as Partial<ThemeData>;
  const storedThemes = Array.isArray(persistedData.customThemes)
    ? (persistedData.customThemes as ThemeDefinition[])
    : [];
  const storedCurrent =
    typeof persistedData.currentTheme === "string"
      ? persistedData.currentTheme
      : DEFAULT_THEME_DATA.currentTheme;
  const data: ThemeData = {
    currentTheme: findTheme(storedCurrent, storedThemes)?.name ?? DEFAULT_THEME_DATA.currentTheme,
    customThemes: storedThemes,
  };
  const mirror: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  const atoms = {} as ThemeAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const cell = store.atom(key, source[key]);
    const handle: Cell<unknown> = {
      id: cell.id,
      get: cell.get,
      set: (value) => {
        cell.set(value);
        mirror[key] = value;
      },
      update: (fn) => {
        const next = (fn as (prev: unknown) => unknown)(cell.get());
        cell.set(next);
        mirror[key] = next;
      },
      subscribe: cell.subscribe,
    };
    sink[key] = handle;
  }

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

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
      atoms.customThemes.set(atoms.customThemes.get().filter((t) => t.name !== name));
      if (atoms.currentTheme.get() === name) {
        applyTheme("win95");
        atoms.currentTheme.set("win95");
      }
    },
    setTheme: (name) => {
      applyTheme(name, atoms.customThemes.get());
      atoms.currentTheme.set(name);
    },
  };

  if (adoptedFromLegacy) {
    handle.setTheme(data.currentTheme);
    persistor.write({ ...mirror });
    persistor.flush();
    const [storage, storageError] = attemptSync(() => getStorage());
    if (storageError !== null) reportBackgroundError("theme.signal.adopt", storageError);
    else {
      const [adopted, adoptError] = attemptSync(() => storage?.getItem(persistKey("theme")));
      if (adoptError !== null) reportBackgroundError("theme.signal.adopt", adoptError);
      else if (adopted) {
        const [, removeError] = attemptSync(() => storage?.removeItem("themeState"));
        if (removeError !== null) reportBackgroundError("theme.signal.adopt", removeError);
      }
    }
  } else {
    applyTheme(data.currentTheme, data.customThemes);
  }

  return handle;
}

const theme = createThemeSignalStore();

export const themeAtoms = theme.atoms;
export const themePersistor = theme.persistor;
export const addCustomTheme = theme.addCustomTheme;
export const removeCustomTheme = theme.removeCustomTheme;
export const setTheme = theme.setTheme;

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
