import type { EndOfFileMode } from "@/types/player/videoPlayer";

export interface EofModeMpvProps {
  keepOpen: string;
  loopFile: string;
  loopPlaylist: string;
}

export const EOF_MODE_MPV_PROPS: Record<EndOfFileMode, EofModeMpvProps> = {
  none: { keepOpen: "always", loopFile: "no", loopPlaylist: "no" },
  pause: { keepOpen: "yes", loopFile: "no", loopPlaylist: "no" },
  next: { keepOpen: "no", loopFile: "no", loopPlaylist: "no" },
  repeat: { keepOpen: "no", loopFile: "inf", loopPlaylist: "no" },
};
