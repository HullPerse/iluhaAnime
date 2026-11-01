import type { Dispatch, SetStateAction } from "react";

export interface PlayerPlaylistFocusOptions {
  playlistOpen: boolean;
  playlistFocus: number | null;
  setPlaylistFocus: Dispatch<SetStateAction<number | null>>;
  onPlayIndex: (index: number) => Promise<void>;
}

export interface PlayerPlaylistFocusHandlers {
  onPlaylistFocus: (delta: number) => void;
  onPlaylistActivate: () => void;
}
