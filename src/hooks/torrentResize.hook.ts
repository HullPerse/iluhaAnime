import { useCallback, type RefObject } from "react";

import {
  TORRENT_LIST_MAX_HEIGHT,
  TORRENT_MIN_HEIGHT,
} from "@/config/player/torrents.config";
import { useBottomResize } from "@/hooks/folderResize.hook";
import { maxFolderHeight } from "@/lib/player/folder.utils";
import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import { playerVisibility } from "@/lib/settings/playerVisibility.service";

/**
 * Drag-to-resize for one torrent card in the player route. The height is saved
 * per info hash, the same way saved folders store theirs per path.
 */
export function useTorrentCardResize(
  infoHash: string,
  rootRef: RefObject<HTMLElement | null>
) {
  const savedHeight = useCell(settingsAtoms.playerTorrentHeights)[infoHash];
  const viewportMax = maxFolderHeight();
  const appliedHeight =
    savedHeight !== undefined ? Math.min(savedHeight, viewportMax) : undefined;

  const getStartHeight = useCallback(
    () =>
      rootRef.current?.querySelector<HTMLElement>("[data-torrent-file-list]")
        ?.clientHeight,
    [rootRef]
  );

  const { dragging, previewHeight, beginDrag, adjust } = useBottomResize({
    height: appliedHeight ?? TORRENT_LIST_MAX_HEIGHT,
    minHeight: TORRENT_MIN_HEIGHT,
    maxHeight: viewportMax,
    getStartHeight,
    onResizeEnd: (height) => playerVisibility.setPlayerTorrentHeight(infoHash, height),
  });

  return {
    listHeight: dragging && previewHeight !== null ? previewHeight : appliedHeight,
    beginDrag,
    adjust,
  };
}
