import type { StreamPrefs, StreamVariant } from "@/types/player/stream";
import type { StreamSource } from "@/types/player/videoPlayer";

export interface Playable {
  variant: StreamVariant;
  source: StreamSource;
  sources: StreamSource[];
  variants: StreamVariant[];
}

export type StreamPlaybackResult =
  | { playable: Playable; prefs: StreamPrefs | null; resume: number | undefined }
  | { failure: string };
