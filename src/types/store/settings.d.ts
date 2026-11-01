import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import type { SettingsStore } from "@/types/ui/settings";

export type SettingsData = Omit<SettingsStore, "patch">;
export type SettingsAtoms = { [K in keyof SettingsData]: Cell<SettingsData[K]> };

export interface SettingsSignalStore {
  atoms: SettingsAtoms;
  persistor: Persistor;
  snapshot: () => SettingsData;
  rehydrate: () => void;
  patch: (partial: Partial<SettingsData>) => void;
  subscribeAll: (fn: () => void) => () => void;
}
