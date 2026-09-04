import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_SETTINGS } from "@/config/settings.config";
import { applyFontFamily, DEFAULT_FONT_FAMILY } from "@/lib/font.utils";
import { detectSystemLocale } from "@/lib/locale.utils";
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
  if (migrated.searchSemanticEnabled === undefined) migrated.searchSemanticEnabled = true;
  if (migrated.searchIntentEnabled === undefined) migrated.searchIntentEnabled = true;
  return migrated;
}

function applySettingsV5(
  migrated: Partial<SettingsStore>,
  version: number
): Partial<SettingsStore> {
  if (version >= 5) return migrated;
  if (migrated.fastembedSource === undefined) migrated.fastembedSource = "q";
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
  } catch {}
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
    }),
    {
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
        return migrated;
      },
      name: "settings",
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyUiPreferences(state.retroStyle, state.uiDensity);
          if (state.appFont) applyFontFamily(state.appFont);
        }
      },
      version: 13,
    }
  )
);

applyUiPreferences(useSettingsStore.getState().retroStyle, useSettingsStore.getState().uiDensity);
{
  const { appFont } = useSettingsStore.getState();
  if (appFont) applyFontFamily(appFont);
}
