import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_SETTINGS } from "@/config/settings.config";
import { detectSystemLocale } from "@/lib/locale.utils";
import type { SettingsStore } from "@/types/settings";

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
          const normalized = path
            .replace(/\\/g, "/")
            .replace(/\/$/, "")
            .toLowerCase();
          return state.hiddenPlayerFolders.some(
            (value) =>
              value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() ===
              normalized
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
      patch: (partial) =>
        set((state) => {
          const retroStyle = partial.retroStyle ?? state.retroStyle;
          const uiDensity = partial.uiDensity ?? state.uiDensity;
          applyUiPreferences(retroStyle, uiDensity);
          return partial;
        }),
      unhidePlayerFolder: (path) =>
        set((state) => {
          const normalized = path
            .replace(/\\/g, "/")
            .replace(/\/$/, "")
            .toLowerCase();
          return {
            hiddenPlayerFolders: state.hiddenPlayerFolders.filter(
              (value) =>
                value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() !==
                normalized
            ),
          };
        }),
      unhidePlayerTorrent: (infoHash) =>
        set((state) => ({
          hiddenPlayerTorrents: state.hiddenPlayerTorrents.filter(
            (value) => value !== infoHash
          ),
        })),
    }),
    {
      migrate: (persistedState: unknown, _version: number) => {
        if (!persistedState || typeof persistedState !== "object") return {};
        const state = persistedState as Partial<SettingsStore> & {
          inlineAutocompleteEnabled?: boolean;
        };
        const migrated: Partial<SettingsStore> = {
          ...state,
          language: state.language === "en" ? "en" : "ru",
        };
        delete (migrated as Record<string, unknown>).inlineAutocompleteEnabled;
        if (state.inlineAutocompleteEnabled === false) {
          migrated.autocompleteMode = "off";
        }
        return migrated;
      },
      name: "settings",
      onRehydrateStorage: () => (state) => {
        if (state) applyUiPreferences(state.retroStyle, state.uiDensity);
      },
      version: 2,
    }
  )
);

applyUiPreferences(
  useSettingsStore.getState().retroStyle,
  useSettingsStore.getState().uiDensity
);
