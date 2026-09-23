import { memo, useMemo } from "react";

import { useTorrentItemActions } from "@/hooks/torrent/actions.hook";
import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent";

import TorrentItem from "./item.torrent";

interface TorrentRowProps {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  filesError?: string;
  isExpanded: boolean;
  selected: boolean;
  busy: boolean;
  queueIndex: number;
  queueTotal: number;
  queueEnabled: boolean;
  onMoveQueue: (id: number, delta: -1 | 1) => void;
  onToggleExpand: () => void;
  onSelectChange: (selected: boolean) => void;
}

export const TorrentRow = memo(
  ({
    item,
    files,
    filesError,
    isExpanded,
    selected,
    busy,
    queueIndex,
    queueTotal,
    queueEnabled,
    onMoveQueue,
    onToggleExpand,
    onSelectChange,
  }: TorrentRowProps) => {
    const actions = useTorrentItemActions(item);
    const {
      onPause: handlePause,
      onResume: handleResume,
      onSeedChange: handleSeedChange,
      onRemove: handleRemove,
      onUpdateFiles: handleUpdateFiles,
      onFilePriorityChange: handleFilePriorityChange,
      onSetDownloadOrder: handleSetDownloadOrder,
      onSetSequential: handleSetSequential,
      onRecreate: handleRecreate,
      onRedownload: handleRedownload,
      onRecheck: handleRecheck,
      onRecheckPaused: handleRecheckPaused,
    } = actions;
    const queue = useMemo(
      () =>
        queueEnabled
          ? {
              index: queueIndex,
              total: queueTotal,
              onMove: (delta: -1 | 1) => onMoveQueue(item.id, delta),
            }
          : null,
      [queueEnabled, queueIndex, queueTotal, onMoveQueue, item.id]
    );
    return (
      <TorrentItem
        item={item}
        files={files}
        filesError={filesError}
        isExpanded={isExpanded}
        selected={selected}
        busy={busy}
        queue={queue}
        onToggleExpand={onToggleExpand}
        onSelectChange={onSelectChange}
        onPause={handlePause}
        onResume={handleResume}
        onSeedChange={handleSeedChange}
        onRemove={handleRemove}
        onUpdateFiles={handleUpdateFiles}
        onFilePriorityChange={handleFilePriorityChange}
        onSetDownloadOrder={handleSetDownloadOrder}
        onSetSequential={handleSetSequential}
        onRecreate={handleRecreate}
        onRedownload={handleRedownload}
        onRecheck={handleRecheck}
        onRecheckPaused={handleRecheckPaused}
      />
    );
  }
);
