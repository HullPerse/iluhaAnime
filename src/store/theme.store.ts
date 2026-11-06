import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { THEMES } from "@/config/graphics/themes.config";
import { buildMirrorAtoms, createPersistedStoreContext } from "@/lib/core/persistence/persisted.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import type { SignalStoreOptions } from "@/types/store/options";
import { applyTheme } from "@/lib/core/ui/appearance.utils";
import { findTheme } from "@/lib/graphics/themeResolve.utils";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import type { ThemeDefinition, ThemePatch } from "@/types/graphics/theme";
import type { ThemeData, ThemeSignalStore } from "@/types/store/theme";
import { parseThemePatch } from "@/store/theme/theme.parser";

export {
  parseRetroismTheme,
  parseThemeFile,
  themePatchToJson,
  themeToJson,
} from "@/store/theme/theme.parser";

export const THEME_SCHEMA_VERSION = SCHEMA_VERSIONS.theme;

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

export function createThemeSignalStore(options: SignalStoreOptions = {}): ThemeSignalStore {
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
export const addCustomTheme = theme.addCustomTheme;
export const removeCustomTheme = theme.removeCustomTheme;
export const setTheme = theme.setTheme;
export const setThemePatch = theme.setThemePatch;
export const clearThemePatch = theme.clearThemePatch;

