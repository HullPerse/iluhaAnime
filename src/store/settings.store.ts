import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  DEFAULT_SETTINGS,
  DEFAULT_WALLPAPER_FILTERS,
  DEFAULT_WALLPAPER_SHADOW,
} from "@/config/settings/defaults.config";
import { detectSystemLocale } from "@/lib/locale/system.utils";
import { normalizePlayerPath } from "@/lib/player/visibility.utils";
import { applyFontFamily, DEFAULT_FONT_FAMILY } from "@/lib/utils/font.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { SettingsStore } from "@/types/settings";

function cleanupLegacyFlags(
  migrated: Partial<SettingsStore>,
  state: Partial<SettingsStore> & { inlineAutocompleteEnabled?: boolean; vaultTabEnabled?: boolean }
): Partial<SettingsStore> {
  delete (migrated as Record<string, unknown>).inlineAutocompleteEnabled;
  delete (migrated as Record<string, unknown>).vaultTabEnabled;
  if (state.inlineAutocompleteEnabled === false) migrated.autocompleteMode = "off";
  return migrated;
}

function applySettingsV3(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 3) return migrated;
  if (migrated.anilistTabEnabled === undefined) migrated.anilistTabEnabled = true;
  if (migrated.collectionTabEnabled === undefined) migrated.collectionTabEnabled = true;
  return migrated;
}

function applySettingsV4(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 4) return migrated;
  if (migrated.searchSymSpellEnabled === undefined) migrated.searchSymSpellEnabled = true;
  if (migrated.searchIntentEnabled === undefined) migrated.searchIntentEnabled = true;
  return migrated;
}

function applySettingsV5(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 5) return migrated;
  return migrated;
}

function applySettingsV6(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 6) return migrated;
  return migrated;
}

function applySettingsV7(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 7) return migrated;
  if (migrated.appFont === undefined) migrated.appFont = null;
  return migrated;
}

function applySettingsV8(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 8) return migrated;
  if (migrated.searchProxyUrls === undefined) migrated.searchProxyUrls = {};
  if (typeof migrated.searchProxyUrls !== "object" || migrated.searchProxyUrls === null)
    migrated.searchProxyUrls = {};
  return migrated;
}

function applySettingsV9(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 9) return migrated;
  if (migrated.searchTabEnabled === undefined) migrated.searchTabEnabled = true;
  if (migrated.torrentTabEnabled === undefined) migrated.torrentTabEnabled = true;
  if (migrated.playerTabEnabled === undefined) migrated.playerTabEnabled = true;
  return migrated;
}

function applySettingsV10(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 10) return migrated;
  delete (migrated as Record<string, unknown>).defaultTab;
  delete (migrated as Record<string, unknown>).lastActiveTab;
  try {
    localStorage.removeItem("lastActiveTab");
  } catch (error) {
    reportBackgroundError("settings.migrate.cleanup", error);
  }
  return migrated;
}

function applySettingsV11(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 11) return migrated;
  if (migrated.notifyNewEpisodes === undefined) migrated.notifyNewEpisodes = true;
  if (migrated.notifyStatusChanges === undefined) migrated.notifyStatusChanges = true;
  if (migrated.anilistPollIntervalMin === undefined) migrated.anilistPollIntervalMin = 30;
  if (migrated.anilistNotifyLists === undefined) migrated.anilistNotifyLists = null;
  delete (migrated as Record<string, unknown>).toastDuration;
  return migrated;
}

function applySettingsV12(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 12) return migrated;
  delete (migrated as Record<string, unknown>).searchDedupEnabled;
  return migrated;
}

function applySettingsV13(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 13) return migrated;
  const legacy = (migrated as Partial<SettingsStore> & { anilistPageSize?: unknown })
    .anilistPageSize;
  if (migrated.pageSize === undefined) {
    migrated.pageSize = typeof legacy === "number" ? legacy : DEFAULT_SETTINGS.pageSize;
  }
  delete (migrated as Record<string, unknown>).anilistPageSize;
  return migrated;
}

function applySettingsV14(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 14) return migrated;
  if (migrated.collectionGroupHeaderStyle === undefined)
    migrated.collectionGroupHeaderStyle = DEFAULT_SETTINGS.collectionGroupHeaderStyle;
  return migrated;
}

function applySettingsV15(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 15) return migrated;
  const legacy = migrated as Partial<SettingsStore> & {
    dlLimit?: number | null;
    ulLimit?: number | null;
  };
  if (migrated.limits === undefined) {
    migrated.limits = {
      download: legacy.dlLimit ?? null,
      upload: legacy.ulLimit ?? null,
    };
  }
  delete (migrated as Record<string, unknown>).dlLimit;
  delete (migrated as Record<string, unknown>).ulLimit;
  return migrated;
}

function applySettingsV16(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 16) return migrated;
  if (migrated.playerFolderHeights === undefined || migrated.playerFolderHeights === null) {
    migrated.playerFolderHeights = {};
  }
  if (typeof migrated.playerFolderHeights !== "object") {
    migrated.playerFolderHeights = {};
  }
  return migrated;
}

function applySettingsV17(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 17) return migrated;
  if (migrated.searchType !== "default" && migrated.searchType !== "modern") {
    migrated.searchType = DEFAULT_SETTINGS.searchType;
  }
  return migrated;
}

function applySettingsV18(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 18) return migrated;
  if (migrated.selectedDitherId === undefined) migrated.selectedDitherId = null;
  return migrated;
}

function applySettingsV19(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 19) return migrated;
  if (migrated.wallpaperFilters === undefined) {
    migrated.wallpaperFilters = { ...DEFAULT_WALLPAPER_FILTERS };
  }
  if (migrated.wallpaperShadow === undefined) {
    migrated.wallpaperShadow = { ...DEFAULT_WALLPAPER_SHADOW };
  }
  return migrated;
}

function applySettingsV20(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 20) return migrated;
  const legacy = (migrated as Record<string, unknown>).wallpaperShadow as
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
  if (migrated.searchShadow === undefined) {
    migrated.searchShadow = {
      sides,
      intensity: typeof legacy?.intensity === "number" ? legacy.intensity : 50,
      color: typeof legacy?.color === "string" ? legacy.color : "#000000",
      length: DEFAULT_WALLPAPER_SHADOW.length,
      softness: DEFAULT_WALLPAPER_SHADOW.softness,
    };
  }
  delete (migrated as Record<string, unknown>).wallpaperShadow;
  if (migrated.wallpaperShadow === undefined) {
    migrated.wallpaperShadow = {
      sides: { top: false, right: false, bottom: false, left: false },
      intensity: 50,
      color: "#000000",
      length: DEFAULT_WALLPAPER_SHADOW.length,
      softness: DEFAULT_WALLPAPER_SHADOW.softness,
    };
  }
  return migrated;
}

function applySettingsV21(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 21) return migrated;
  if (migrated.anilistProxyUrl === undefined) migrated.anilistProxyUrl = null;
  return migrated;
}

function applySettingsV22(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 22) return migrated;
  for (const key of ["searchShadow", "wallpaperShadow"] as const) {
    const shadow = migrated[key];
    if (shadow && typeof shadow === "object") {
      if (typeof shadow.length !== "number") shadow.length = DEFAULT_WALLPAPER_SHADOW.length;
      if (typeof shadow.softness !== "number") shadow.softness = DEFAULT_WALLPAPER_SHADOW.softness;
    }
  }
  return migrated;
}
function applySettingsV23(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 23) return migrated;
  const legacy = (migrated as Record<string, unknown>).tmdbApiKey;
  delete (migrated as Record<string, unknown>).tmdbApiKey;
  if (typeof legacy === "string" && legacy.trim()) {
    migrated.tmdbPendingKey = legacy.trim();
  } else if (migrated.tmdbPendingKey === undefined) {
    migrated.tmdbPendingKey = null;
  }
  if (migrated.tmdbKeySet === undefined) migrated.tmdbKeySet = false;
  return migrated;
}

function drainTmdbPendingKey(state: SettingsStore): void {
  const pending = state.tmdbPendingKey;
  if (!pending) return;
  invokeTyped("tmdb_set_api_key", { api_key: pending })
    .then(() => {
      useSettingsStore.getState().patch({ tmdbPendingKey: null, tmdbKeySet: true });
    })
    .catch(() => {
      useSettingsStore.getState().patch({ tmdbKeySet: false });
    });
}

function applyUiPreferences(
  retroStyle: SettingsStore["retroStyle"],
  uiDensity: SettingsStore["uiDensity"]
) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.retroStyle = retroStyle;
  document.documentElement.dataset.uiDensity = uiDensity;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      language: detectSystemLocale(),
      hidePlayerFolder: (path) =>
        set((state) => {
          const normalized = path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
          return state.hiddenPlayerFolders.some(
            (value) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() === normalized
          )
            ? state
            : { hiddenPlayerFolders: [...state.hiddenPlayerFolders, path] };
        }),
      hidePlayerTorrent: (infoHash) =>
        set((state) =>
          state.hiddenPlayerTorrents.includes(infoHash)
            ? state
            : {
                hiddenPlayerTorrents: [...state.hiddenPlayerTorrents, infoHash],
              }
        ),
      patch: (partial: Partial<SettingsStore>) =>
        set((state) => {
          const retroStyle = partial.retroStyle ?? state.retroStyle;
          const uiDensity = partial.uiDensity ?? state.uiDensity;
          applyUiPreferences(retroStyle, uiDensity);
          if ("appFont" in partial) {
            const next = partial.appFont ?? null;
            if (next) applyFontFamily(next);
            else {
              try {
                const raw = localStorage.getItem("themeVars");
                const parsed = raw ? (JSON.parse(raw) as { fontFamily?: string | null }) : null;
                const themeFont = parsed?.fontFamily ?? null;
                const css = themeFont ? themeFont : DEFAULT_FONT_FAMILY;
                if (typeof document !== "undefined" && document.documentElement)
                  document.documentElement.style.setProperty("--font-family", css, "important");
                localStorage.removeItem("appFont");
              } catch {
                applyFontFamily(null);
              }
            }
          }
          return partial;
        }),
      unhidePlayerFolder: (path) =>
        set((state) => {
          const normalized = path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
          return {
            hiddenPlayerFolders: state.hiddenPlayerFolders.filter(
              (value) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() !== normalized
            ),
          };
        }),
      unhidePlayerTorrent: (infoHash) =>
        set((state) => ({
          hiddenPlayerTorrents: state.hiddenPlayerTorrents.filter((value) => value !== infoHash),
        })),
      setPlayerFolderHeight: (path, height) =>
        set((state) => {
          const key = normalizePlayerPath(path);
          if (!key) return state;
          const heights = { ...state.playerFolderHeights };
          if (height === null) delete heights[key];
          else heights[key] = height;
          return { playerFolderHeights: heights };
        }),
    }),
    {
      name: "settings",
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== "object") return {};
        const state = persistedState as Partial<SettingsStore> & {
          inlineAutocompleteEnabled?: boolean;
          vaultTabEnabled?: boolean;
        };
        let migrated: Partial<SettingsStore> = {
          ...state,
          language: state.language === "en" ? "en" : "ru",
        };
        migrated = cleanupLegacyFlags(migrated, state);
        migrated = applySettingsV3(migrated, version);
        migrated = applySettingsV4(migrated, version);
        migrated = applySettingsV5(migrated, version);
        migrated = applySettingsV6(migrated, version);
        migrated = applySettingsV7(migrated, version);
        migrated = applySettingsV8(migrated, version);
        migrated = applySettingsV9(migrated, version);
        migrated = applySettingsV10(migrated, version);
        migrated = applySettingsV11(migrated, version);
        migrated = applySettingsV12(migrated, version);
        migrated = applySettingsV13(migrated, version);
        migrated = applySettingsV14(migrated, version);
        migrated = applySettingsV15(migrated, version);
        migrated = applySettingsV16(migrated, version);
        migrated = applySettingsV17(migrated, version);
        migrated = applySettingsV18(migrated, version);
        migrated = applySettingsV19(migrated, version);
        migrated = applySettingsV20(migrated, version);
        migrated = applySettingsV21(migrated, version);
        migrated = applySettingsV22(migrated, version);
        migrated = applySettingsV23(migrated, version);
        return migrated;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyUiPreferences(state.retroStyle, state.uiDensity);
          if (state.appFont) applyFontFamily(state.appFont);
          drainTmdbPendingKey(state);
        }
      },
      version: 23,
    }
  )
);

applyUiPreferences(useSettingsStore.getState().retroStyle, useSettingsStore.getState().uiDensity);
{
  const { appFont } = useSettingsStore.getState();
  if (appFont) applyFontFamily(appFont);
}
