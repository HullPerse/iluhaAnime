import { PlayerSettings, PlayerStore } from "@/types/player";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const D: PlayerSettings = {
  rotation: 0,
  flipH: false,
  flipV: false,
  zoom: 1,
  aspectRatio: "contain",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  subFontSize: 18,
  subFontFamily: "Arial",
  subColor: "#ffffff",
  subBgOpacity: 0,
  subBgColor: "#000000",
};

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      volume: 1,
      folderPaths: [],
      settings: { ...D },

      setVolume: (v) => set({ volume: v }),

      setFolderPaths: (paths) => set({ folderPaths: paths }),

      patchSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    { name: "playerState" },
  ),
);
