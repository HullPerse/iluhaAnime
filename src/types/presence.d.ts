import type { StreamOpen } from "@/types/videoPlayer";

export interface PlayerPresenceInput {
  stream: StreamOpen | null;
  path: string;
  hasFile: boolean;
  paused: boolean;
  eofReached: boolean;
  duration: number;
  timePos: number;
  parseTitles: boolean;
}
