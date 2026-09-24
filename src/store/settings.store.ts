import { create } from "zustand";
import { persist } from "zustand/middleware";

import { tauriTransport } from "@/api/transport.api";
import { DEFAULT_SETTINGS, DEFAULT_WALLPAPER_SHADOW } from "@/config/settings/defaults.config";
import { listSortKeys } from "@/lib/anilist/entries.utils";
import { detectSystemLocale } from "@/lib/locale/system.utils";
import { normalizePlayerPath } from "@/lib/player/visibility.utils";
import { applyWindowChrome } from "@/lib/settings/window.utils";
import type { MigrationState, MigrationTransform } from "@/lib/store/migrate.utils";
import { resolveWithDefaults, runTransforms } from "@/lib/store/migrate.utils";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { applyFontFamily, DEFAULT_FONT_FAMILY } from "@/lib/utils/font.utils";
import type { SettingsStore } from "@/types/settings";

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
];

const SETTINGS_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  searchType: (value) => value === "default" || value === "modern",
  screenshotFormat: (value) => value === "png" || value === "jpeg",
  anilistDisplayMode: (value) => value === "scroll" || value === "pagination",
  anilistListSort: (value) => {
    if (typeof value !== "object" || value === null) return false;
    const sort = value as { key?: unknown; dir?: unknown };
    return (
      typeof sort.key === "string" &&
      (listSortKeys as string[]).includes(sort.key) &&
      (sort.dir === "asc" || sort.dir === "desc")
    );
  },
};

function drainTmdbPendingKey(state: SettingsStore): void {
  const pending = state.tmdbPendingKey;
  if (!pending) return;
  (async () => {
    const [, error] = await attempt(tauriTransport.call("tmdb_set_api_key", { apiKey: pending }));
    if (error) useSettingsStore.getState().patch({ tmdbKeySet: false });
    else useSettingsStore.getState().patch({ tmdbPendingKey: null, tmdbKeySet: true });
  })();
}

function applyUiPreferences(
  retroStyle: SettingsStore["retroStyle"],
  uiDensity: SettingsStore["uiDensity"]
) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.retroStyle = retroStyle;
  document.documentElement.dataset.uiDensity = uiDensity;
}

function applyWindowEffect(effect: SettingsStore["windowEffect"]): void {
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
          if ("yorhaScanlinesEnabled" in partial) {
            applyYorhaScanlines(partial.yorhaScanlinesEnabled ?? state.yorhaScanlinesEnabled);
          }
          if ("windowEffect" in partial) {
            applyWindowEffect(partial.windowEffect ?? state.windowEffect);
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
              customTitleBarEnabled: partial.customTitleBarEnabled ?? state.customTitleBarEnabled,
              roundedWindowCorners: partial.roundedWindowCorners ?? state.roundedWindowCorners,
              windowEffect: partial.windowEffect ?? state.windowEffect,
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
        const state = persistedState as MigrationState & { language?: unknown };
        const { language, ...rest } = state;
        const transformed = runTransforms(rest, version, SETTINGS_TRANSFORMS);
        return {
          ...resolveWithDefaults(
            transformed,
            DEFAULT_SETTINGS as unknown as MigrationState,
            SETTINGS_VALIDATORS
          ),
          language: language === "en" ? "en" : "ru",
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
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
          drainTmdbPendingKey(state);
        }
      },
      version: 36,
    }
  )
);

applyUiPreferences(useSettingsStore.getState().retroStyle, useSettingsStore.getState().uiDensity);
applyWindowEffect(useSettingsStore.getState().windowEffect);
applyWindowTint(useSettingsStore.getState().windowTintOpacity);
applyYorhaScanlines(useSettingsStore.getState().yorhaScanlinesEnabled);
{
  const { appFont } = useSettingsStore.getState();
  if (appFont) applyFontFamily(appFont);
}
