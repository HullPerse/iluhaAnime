import type { KeybindManifestEntry } from "@/types/manifest";

export type KeybindOverride = string | null;

export interface ResolvedKeybind {
  entry: KeybindManifestEntry;
  activeChord: string | null;
  shadowedChord: string | null;
  shadowedBy: string | null;
  overridden: boolean;
}
