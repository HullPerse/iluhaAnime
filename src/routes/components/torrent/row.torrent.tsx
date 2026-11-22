import { memo, useCallback, useMemo } from "react";

import { useTorrentItemActions } from "@/hooks/torrent/actions.hook";
import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent/torrent";

import TorrentItem from "@/routes/components/torrent/item.torrent";

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
  onToggleExpand: (id: number) => void;
  onSelectChange: (id: number, selected: boolean) => void;
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
      onApplyQueue: handleApplyQueue,
      onSetSequential: handleSetSequential,
      onRecreate: handleRecreate,
      onRedownload: handleRedownload,
      onRecheck: handleRecheck,
      onRecheckPaused: handleRecheckPaused,
      onUpdateRequest: handleUpdateRequest,
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
    const handleToggleExpand = useCallback(
      () => onToggleExpand(item.id),
      [item.id, onToggleExpand]
    );
    const handleSelectChange = useCallback(
      (value: boolean) => onSelectChange(item.id, value),
      [item.id, onSelectChange]
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
        onToggleExpand={handleToggleExpand}
        onSelectChange={handleSelectChange}
        onPause={handlePause}
        onResume={handleResume}
        onSeedChange={handleSeedChange}
        onRemove={handleRemove}
        onUpdateFiles={handleUpdateFiles}
        onFilePriorityChange={handleFilePriorityChange}
        onApplyQueue={handleApplyQueue}
        onSetSequential={handleSetSequential}
        onRecreate={handleRecreate}
        onRedownload={handleRedownload}
        onRecheck={handleRecheck}
        onRecheckPaused={handleRecheckPaused}
        onUpdateRequest={handleUpdateRequest}
      />
    );
  }
);
