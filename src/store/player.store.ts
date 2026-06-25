import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PlayerSettings {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
  aspectRatio: "contain" | "cover" | "fill" | "none" | "scale-down";
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sepia: number;
  grayscale: number;
  subFontSize: number;
  subFontFamily: string;
  subColor: string;
  subBgOpacity: number;
  subBgColor: string;
}

interface PlayerStore {
  volume: number;
  folderPaths: string[];
  settings: PlayerSettings;
  setVolume: (v: number) => void;
  setFolderPaths: (paths: string[]) => void;
  patchSettings: (p: Partial<PlayerSettings>) => void;
}

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

      patchSettings: (p) =>
        set((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    { name: "playerState" },
  ),
);
