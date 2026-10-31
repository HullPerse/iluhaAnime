import type { Cell } from "@/types/core/signal";
import type { SettingsStore } from "@/types/ui/settings";

export type SettingsData = Omit<SettingsStore, "patch">;
export type SettingsAtoms = { [K in keyof SettingsData]: Cell<SettingsData[K]> };
