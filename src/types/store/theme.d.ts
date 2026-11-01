import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import type { ThemeDefinition, ThemePatch, ThemeStore } from "@/types/graphics/theme";

type ThemeActionKeys =
  | "addCustomTheme"
  | "removeCustomTheme"
  | "setTheme"
  | "setThemePatch"
  | "clearThemePatch";

export type ThemeData = Omit<ThemeStore, ThemeActionKeys>;
export type ThemeAtoms = { [K in keyof ThemeData]: Cell<ThemeData[K]> };

export interface ThemeSignalStore {
  atoms: ThemeAtoms;
  persistor: Persistor;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (name: string) => void;
  setTheme: (name: string) => void;
  setThemePatch: (name: string, patch: ThemePatch) => void;
  clearThemePatch: (name: string) => void;
}
