import { useCallback } from "react";

import { movePlaylistFocus } from "@/lib/core/player/playlistFocus.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { playbackAtoms } from "@/store/player.store";
import type {
  PlayerPlaylistFocusHandlers,
  PlayerPlaylistFocusOptions,
} from "@/types/player/playlistFocus";

export function usePlayerPlaylistFocus(
  options: PlayerPlaylistFocusOptions
): PlayerPlaylistFocusHandlers {
  const { playlistOpen, playlistFocus, setPlaylistFocus, onPlayIndex } = options;

  const onPlaylistFocus = useCallback(
    (delta: number) => {
      if (!playlistOpen) return;
      setPlaylistFocus((previous) =>
        movePlaylistFocus(
          previous,
          playbackAtoms.playlistIndex.get(),
          playbackAtoms.playlistCount.get(),
          delta
        )
      );
    },
    [playlistOpen, setPlaylistFocus]
  );

  const onPlaylistActivate = useCallback(() => {
    if (!playlistOpen) return;
    const count = playbackAtoms.playlistCount.get();
    const index = playlistFocus ?? playbackAtoms.playlistIndex.get();
    if (index < 0 || index >= count) return;
    ignore(onPlayIndex(index));
  }, [onPlayIndex, playlistFocus, playlistOpen]);

  return { onPlaylistFocus, onPlaylistActivate };
}
