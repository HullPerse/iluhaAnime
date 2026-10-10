import * as z from "zod/mini";

import { tauriTransport } from "@/api/transport.api";
import { DEFAULT_SETTINGS, DEFAULT_WALLPAPER_SHADOW } from "@/config/settings/defaults.config";
import { DITHER_PLACEHOLDER_ID } from "@/config/utils/dither.config";
import { listSortKeys } from "@/lib/anilist/entries.utils";
import { detectSystemLocale } from "@/lib/locale/system.utils";
import { normalizePlayerPath } from "@/lib/player/visibility.utils";
import { applyWindowChrome } from "@/lib/settings/window.utils";
import type { Persistor } from "@/lib/state/persist.utils";
import { createPersistedStoreContext } from "@/lib/state/persisted.utils";
import type { Cell, SignalStore } from "@/lib/state/signal.store";
import type { MigrationState, MigrationTransform } from "@/lib/store/migrate.utils";
import { resolveWithDefaults, runTransforms } from "@/lib/store/migrate.utils";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { applyFontFamily, DEFAULT_FONT_FAMILY } from "@/lib/utils/font.utils";
import { toValidator } from "@/lib/utils/schema.utils";
import type { SettingsStore } from "@/types/settings";

export const SETTINGS_SCHEMA_VERSION = 42;

type SettingsActionKeys =
  | "hidePlayerFolder"
  | "unhidePlayerFolder"
  | "hidePlayerTorrent"
  | "unhidePlayerTorrent"
  | "setPlayerFolderHeight"
  | "patch";

export type SettingsData = Omit<SettingsStore, SettingsActionKeys>;
export type SettingsAtoms = { [K in keyof SettingsData]: Cell<SettingsData[K]> };

const SETTINGS_TRANSFORMS: MigrationTransform[] = [
  {
    migrate: (state) => {
      const inlineOff = state.inlineAutocompleteEnabled === false;
      delete state.inlineAutocompleteEnabled;
      delete state.vaultTabEnabled;
      if (inlineOff) state.autocompleteMode = "off";
    },
  },
  {
    from: 10,
    migrate: (state) => {
      delete state.defaultTab;
      delete state.lastActiveTab;
      const [, error] = attemptSync(() => localStorage.removeItem("lastActiveTab"));
      if (error !== null) reportBackgroundError("settings.migrate.cleanup", error);
    },
  },
  {
    from: 11,
    migrate: (state) => {
      delete state.toastDuration;
    },
  },
  {
    from: 12,
    migrate: (state) => {
      delete state.searchDedupEnabled;
    },
  },
  {
    from: 13,
    migrate: (state) => {
      const legacy = state.anilistPageSize;
      if (state.pageSize === undefined) {
        state.pageSize = typeof legacy === "number" ? legacy : DEFAULT_SETTINGS.pageSize;
      }
      delete state.anilistPageSize;
    },
  },
  {
    from: 15,
    migrate: (state) => {
      if (state.limits === undefined) {
        const download = state.dlLimit;
        const upload = state.ulLimit;
        state.limits = {
          download: typeof download === "number" ? download : null,
          upload: typeof upload === "number" ? upload : null,
        };
      }
      delete state.dlLimit;
      delete state.ulLimit;
    },
  },
  {
    from: 20,
    migrate: (state) => {
      const legacy = state.wallpaperShadow as
        | { side?: unknown; intensity?: unknown; color?: unknown }
        | undefined;
      const sides = { top: false, right: false, bottom: false, left: false };
      if (legacy && typeof legacy === "object") {
        if (legacy.side === "around") {
          sides.top = true;
          sides.right = true;
          sides.bottom = true;
          sides.left = true;
        } else {
          const side = legacy.side;
          if (side === "top" || side === "right" || side === "bottom" || side === "left") {
            sides[side] = true;
          }
        }
      }
      if (state.searchShadow === undefined) {
        state.searchShadow = {
          sides,
          intensity: typeof legacy?.intensity === "number" ? legacy.intensity : 50,
          color: typeof legacy?.color === "string" ? legacy.color : "#000000",
          length: DEFAULT_WALLPAPER_SHADOW.length,
          softness: DEFAULT_WALLPAPER_SHADOW.softness,
        };
      }
      delete state.wallpaperShadow;
    },
  },
  {
    from: 23,
    migrate: (state) => {
      const legacy = state.tmdbApiKey;
      delete state.tmdbApiKey;
      if (typeof legacy === "string" && legacy.trim()) {
        state.tmdbPendingKey = legacy.trim();
      }
    },
  },
  {
    from: 25,
    migrate: (state) => {
      delete state.wallpaperParallax;
    },
  },
  {
    from: 36,
    migrate: (state) => {
      delete state.lobbyTabEnabled;
      delete state.chatImagePreviews;
    },
  },
  {
    from: 38,
    migrate: (state) => {
      if (state.parseTitlesPlayer === undefined) {
        state.parseTitlesPlayer = state.parseTitles === true;
      }
      if (state.parseTitlesTorrent === undefined) state.parseTitlesTorrent = false;
      if (state.parseTitlesSearch === undefined) state.parseTitlesSearch = false;
      delete state.parseTitles;
    },
  },
  {
    from: 39,
    migrate: (state) => {
      const schedule = state.themeSchedule as { enabled?: unknown } | undefined;
      if (schedule && typeof schedule === "object") schedule.enabled = false;
    },
  },
  {
    from: 40,
    migrate: (state) => {
      if (state.selectedDitherId === DITHER_PLACEHOLDER_ID) state.selectedDitherId = null;
    },
  },
  {
    from: 41,
    migrate: (state) => {
      delete state.thumbPreviews;
      delete state.spriteBurstMpv;
      delete state.spriteFillPlayback;
      delete state.spriteNeighborCount;
    },
  },
];

const SETTINGS_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  searchType: toValidator(z.enum(["default", "modern"])),
  progressStyle: toValidator(z.enum(["blocks", "solid"])),
  screenshotFormat: toValidator(z.enum(["png", "jpeg"])),
  anilistDisplayMode: toValidator(z.enum(["scroll", "pagination"])),
  anilistListSort: toValidator(
    z.object({
      key: z.string().check(z.refine((value) => (listSortKeys as string[]).includes(value))),
      dir: z.enum(["asc", "desc"]),
    })
  ),
};

export function migrateSettingsData(persistedState: unknown, version: number): SettingsData {
  if (!persistedState || typeof persistedState !== "object") return {} as SettingsData;
  const state = persistedState as MigrationState & { language?: unknown };
  const { language, ...rest } = state;
  const transformed = runTransforms(rest, version, SETTINGS_TRANSFORMS);
  const resolved = resolveWithDefaults(
    transformed,
    DEFAULT_SETTINGS as unknown as MigrationState,
    SETTINGS_VALIDATORS
  ) as unknown as SettingsData;
  return {
    ...resolved,
    language: language === "en" ? "en" : "ru",
  };
}

function buildAtoms(
  store: SignalStore,
  data: SettingsData,
  mirror: Record<string, unknown>
): SettingsAtoms {
  const atoms = {} as SettingsAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const cell = store.atom(key, source[key]);
    const handle: Cell<unknown> = {
      id: cell.id,
      get: cell.get,
      set: (value) => {
        mirror[key] = value;
        cell.set(value);
      },
      update: (fn) => {
        const next = (fn as (prev: unknown) => unknown)(cell.get());
        mirror[key] = next;
        cell.set(next);
      },
      subscribe: cell.subscribe,
    };
    sink[key] = handle;
  }
  return atoms;
}

function applyUiPreferences(
  retroStyle: SettingsData["retroStyle"],
  uiDensity: SettingsData["uiDensity"]
): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.retroStyle = retroStyle;
  document.documentElement.dataset.uiDensity = uiDensity;
}

function applyWindowEffect(effect: SettingsData["windowEffect"]): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.dataset.windowEffect = effect;
}

function applyWindowTint(opacity: number | null): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  if (opacity === null) {
    root.style.removeProperty("--ui-window-opacity");
    return;
  }
  const clamped = Math.max(0, Math.min(1, opacity));
  root.style.setProperty("--ui-window-opacity", `${Math.round(clamped * 100)}%`, "important");
}

function applyYorhaScanlines(enabled: boolean): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.dataset.yorhaScanlines = enabled ? "on" : "off";
}

function applyPatchSideEffects(atoms: SettingsAtoms, partial: Partial<SettingsData>): void {
  applyUiPreferences(
    partial.retroStyle ?? atoms.retroStyle.get(),
    partial.uiDensity ?? atoms.uiDensity.get()
  );
  if ("yorhaScanlinesEnabled" in partial) {
    applyYorhaScanlines(partial.yorhaScanlinesEnabled ?? atoms.yorhaScanlinesEnabled.get());
  }
  if ("windowEffect" in partial) {
    applyWindowEffect(partial.windowEffect ?? atoms.windowEffect.get());
  }
  if ("windowTintOpacity" in partial) {
    applyWindowTint(partial.windowTintOpacity ?? null);
  }
  if (
    "customTitleBarEnabled" in partial ||
    "roundedWindowCorners" in partial ||
    "windowEffect" in partial
  ) {
    applyWindowChrome({
      customTitleBarEnabled: partial.customTitleBarEnabled ?? atoms.customTitleBarEnabled.get(),
      roundedWindowCorners: partial.roundedWindowCorners ?? atoms.roundedWindowCorners.get(),
      windowEffect: partial.windowEffect ?? atoms.windowEffect.get(),
    });
  }
  if ("appFont" in partial) {
    const next = partial.appFont ?? null;
    if (next) applyFontFamily(next);
    else {
      const [, error] = attemptSync(() => {
        const raw = localStorage.getItem("themeVars");
        const parsed = raw ? (JSON.parse(raw) as { fontFamily?: string | null }) : null;
        const css = parsed?.fontFamily ?? DEFAULT_FONT_FAMILY;
        if (typeof document !== "undefined" && document.documentElement)
          document.documentElement.style.setProperty("--font-family", css, "important");
        localStorage.removeItem("appFont");
      });
      if (error !== null) applyFontFamily(null);
    }
  }
}

function readLegacyMigrated(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("settings"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown; version?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  const version = typeof envelope.version === "number" ? envelope.version : 0;
  if (!state || typeof state !== "object") return null;
  const [migrated, migrateError] = attemptSync(() => migrateSettingsData(state, version));
  if (migrateError !== null || !migrated || typeof migrated !== "object") return null;
  return { data: migrated as Record<string, unknown>, schemaVersion: SETTINGS_SCHEMA_VERSION };
}

export interface SettingsSignalStore {
  atoms: SettingsAtoms;
  persistor: Persistor;
  snapshot: () => SettingsData;
  rehydrate: () => void;
  patch: (partial: Partial<SettingsData>) => void;
  hidePlayerFolder: (path: string) => void;
  unhidePlayerFolder: (path: string) => void;
  hidePlayerTorrent: (infoHash: string) => void;
  unhidePlayerTorrent: (infoHash: string) => void;
  setPlayerFolderHeight: (path: string, height: number | null) => void;
  subscribeAll: (fn: () => void) => () => void;
}

export interface SettingsSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export function createSettingsSignalStore(
  options: SettingsSignalOptions = {}
): SettingsSignalStore {
  const { store, persistor, getStorage, finishAdopt } = createPersistedStoreContext({
    storeName: "settings",
    short: "settings",
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyMigrated(get),
  });

  const base: SettingsData = { ...DEFAULT_SETTINGS, language: detectSystemLocale() };
  const persisted = persistor.read();
  const data: SettingsData = persisted
    ? { ...base, ...(persisted.data as Partial<SettingsData>) }
    : base;
  if (data.selectedDitherId === DITHER_PLACEHOLDER_ID) data.selectedDitherId = null;
  const mirror: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  const atoms = buildAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const snapshot = (): SettingsData => ({ ...mirror }) as SettingsData;

  const drainTmdbPendingKey = (): void => {
    const pending = atoms.tmdbPendingKey.get();
    if (!pending) return;
    (async () => {
      const [, error] = await attempt(tauriTransport.call("tmdb_set_api_key", { apiKey: pending }));
      if (error) handle.patch({ tmdbKeySet: false });
      else handle.patch({ tmdbPendingKey: null, tmdbKeySet: true });
    })();
  };

  const handle: SettingsSignalStore = {
    atoms,
    persistor,
    snapshot,
    subscribeAll: (fn) => store.subscribeAll(fn),
    rehydrate: (): void => {
      const state = snapshot();
      const [, cleanupError] = attemptSync(() => {
        const storage = getStorage();
        storage?.removeItem("lobbyConnections");
        storage?.removeItem("sessionIdentity");
      });
      if (cleanupError !== null)
        reportBackgroundError("settings.signal.cleanup-lobby", cleanupError);
      applyUiPreferences(state.retroStyle, state.uiDensity);
      applyWindowEffect(state.windowEffect);
      applyWindowChrome({
        customTitleBarEnabled: state.customTitleBarEnabled,
        roundedWindowCorners: state.roundedWindowCorners,
        windowEffect: state.windowEffect,
      });
      applyWindowTint(state.windowTintOpacity);
      applyYorhaScanlines(state.yorhaScanlinesEnabled);
      if (state.appFont) applyFontFamily(state.appFont);
      drainTmdbPendingKey();
    },
    patch: (partial) => {
      applyPatchSideEffects(atoms, partial);
      const source = partial as unknown as Record<string, unknown>;
      const target = atoms as unknown as Record<string, Cell<unknown>>;
      store.batch(() => {
        for (const key of Object.keys(source)) {
          target[key].set(source[key]);
        }
      });
    },
    hidePlayerFolder: (path) => {
      const cell = atoms.hiddenPlayerFolders;
      const normalized = path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
      const exists = cell
        .get()
        .some((value) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() === normalized);
      if (!exists) cell.set([...cell.get(), path]);
    },
    unhidePlayerFolder: (path) => {
      const cell = atoms.hiddenPlayerFolders;
      const normalized = path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
      cell.set(
        cell
          .get()
          .filter(
            (value) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() !== normalized
          )
      );
    },
    hidePlayerTorrent: (infoHash) => {
      const cell = atoms.hiddenPlayerTorrents;
      if (!cell.get().includes(infoHash)) cell.set([...cell.get(), infoHash]);
    },
    unhidePlayerTorrent: (infoHash) => {
      const cell = atoms.hiddenPlayerTorrents;
      cell.set(cell.get().filter((value) => value !== infoHash));
    },
    setPlayerFolderHeight: (path, height) => {
      const key = normalizePlayerPath(path);
      if (!key) return;
      const cell = atoms.playerFolderHeights;
      const heights = { ...cell.get() };
      if (height === null) delete heights[key];
      else heights[key] = height;
      cell.set(heights);
    },
  };

  finishAdopt(() => ({ ...snapshot() }), { remove: "settings" });

  return handle;
}

const settings = createSettingsSignalStore();

export const settingsAtoms = settings.atoms;
export const settingsPersistor = settings.persistor;
export const getSettingsSnapshot = settings.snapshot;
export const rehydrateSettings = settings.rehydrate;
export const patchSettings = settings.patch;
export const hidePlayerFolder = settings.hidePlayerFolder;
export const unhidePlayerFolder = settings.unhidePlayerFolder;
export const hidePlayerTorrent = settings.hidePlayerTorrent;
export const unhidePlayerTorrent = settings.unhidePlayerTorrent;
export const setPlayerFolderHeight = settings.setPlayerFolderHeight;
export function subscribeSettings(listener: () => void): () => void {
  return settings.subscribeAll(listener);
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => settingsPersistor.flush());
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") settingsPersistor.flush();
  });
}

settings.rehydrate();
applyUiPreferences(settingsAtoms.retroStyle.get(), settingsAtoms.uiDensity.get());
applyWindowEffect(settingsAtoms.windowEffect.get());
applyWindowTint(settingsAtoms.windowTintOpacity.get());
applyYorhaScanlines(settingsAtoms.yorhaScanlinesEnabled.get());
{
  const appFont = settingsAtoms.appFont.get();
  if (appFont) applyFontFamily(appFont);
}
