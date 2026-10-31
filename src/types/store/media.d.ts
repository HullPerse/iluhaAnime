import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import type { MediaEntry } from "@/types/player/videoPlayer";

export interface MediaSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface MediaSignalStore {
  entries: Cell<MediaEntry[]>;
  persistor: Persistor;
  getEntry: (path: string) => MediaEntry | undefined;
  setPosition: (path: string, time: number, duration?: number) => void;
  setTrack: (path: string, type: "audio" | "sub", index: number) => void;
  setSubOffset: (path: string, offset: number) => void;
  setAudioOffset: (path: string, offset: number) => void;
  hydrate: (path: string) => Promise<MediaEntry | undefined>;
  clearEntries: () => void;
}
