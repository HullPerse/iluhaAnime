import { useCallback } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import {
  usePauseTorrent,
  useRecheckPausedTorrent,
  useRecheckTorrent,
  useRedownloadFile,
  useRemoveTorrent,
  useResumeTorrent,
  useSetDownloadOrder,
  useSetFilePriority,
  useSetSequentialDownload,
  useUpdateOnlyFiles,
} from "@/hooks/torrent/queries.hook";
import { describeRecheckOutcome } from "@/lib/torrent/recheck.utils";
import { applyTorrentUpdate } from "@/lib/torrent/update.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { setSeedPreference } from "@/store/cache.store";
import { prepareTorrentDownload } from "@/store/download.store";
import { addNotification } from "@/store/notification.store";
import { torrentApi } from "@/api/torrent.api";
import type {
  FilePriority,
  TorrentDetailFile,
  TorrentDetails,
  TorrentInfo,
} from "@/types/torrent";

export interface TorrentItemActions {
  onPause: () => void;
  onResume: () => void;
  onSeedChange: (enabled: boolean) => void;
  onRemove: (deleteFiles: boolean) => void;
  onUpdateFiles: (indices: number[]) => void;
  onFilePriorityChange: (indices: number[], priority: FilePriority) => void;
  onSetDownloadOrder: (indices: number[]) => void;
  onSetSequential: (enabled: boolean) => void;
  onRecreate: () => void;
  onRedownload: (fileIndex: number) => void;
  onRecheck: () => void;
  onRecheckPaused: () => void;
  onUpdateRequest: (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => void;
}

export function useTorrentItemActions(item: TorrentInfo): TorrentItemActions {
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const removeMutation = useRemoveTorrent();
  const updateOnlyFilesMutation = useUpdateOnlyFiles();
  const setFilePriorityMutation = useSetFilePriority();
  const setDownloadOrderMutation = useSetDownloadOrder();
  const setSequentialMutation = useSetSequentialDownload();
  const redownloadMutation = useRedownloadFile();
  const recheckMutation = useRecheckTorrent();
  const recheckPausedMutation = useRecheckPausedTorrent();
  const { t } = useI18n();
  const id = item.id;
  const infoHash = item.info_hash;

  const onPause = useCallback(() => {
    pauseMutation.mutate({ id, infoHash });
  }, [pauseMutation, id, infoHash]);
  const onResume = useCallback(() => {
    resumeMutation.mutate({ id, infoHash });
  }, [resumeMutation, id, infoHash]);
  const onSeedChange = useCallback(
    (enabled: boolean) => {
      setSeedPreference(id, enabled);
      if (enabled) resumeMutation.mutate({ id, infoHash });
      else pauseMutation.mutate({ id, infoHash });
    },
    [resumeMutation, pauseMutation, id, infoHash]
  );
  const onRemove = useCallback(
    (deleteFiles: boolean) => {
      removeMutation.mutate({ id, deleteFiles, infoHash, name: item.name });
    },
    [removeMutation, id, infoHash, item.name]
  );
  const onUpdateFiles = useCallback(
    (indices: number[]) => {
      updateOnlyFilesMutation.mutate({ id, indices, infoHash });
    },
    [updateOnlyFilesMutation, id, infoHash]
  );
  const onFilePriorityChange = useCallback(
    (indices: number[], priority: FilePriority) => {
      setFilePriorityMutation.mutate({ id, fileIndices: indices, priority, infoHash });
    },
    [setFilePriorityMutation, id, infoHash]
  );
  const onSetDownloadOrder = useCallback(
    (indices: number[]) => {
      setDownloadOrderMutation.mutate({ id, indices, infoHash });
    },
    [setDownloadOrderMutation, id, infoHash]
  );
  const onSetSequential = useCallback(
    (enabled: boolean) => {
      setSequentialMutation.mutate({ id, enabled, infoHash });
    },
    [setSequentialMutation, id, infoHash]
  );
  const onRecreate = useCallback(async () => {
    const removed = await removeMutation.mutateAsync({
      id,
      deleteFiles: false,
      infoHash,
      name: item.name,
      silent: true,
    });
    if (!removed) return;
    prepareTorrentDownload(`magnet:?xt=urn:btih:${infoHash}`);
  }, [removeMutation, id, infoHash, item.name]);
  const onRedownload = useCallback(
    (fileIndex: number) => {
      redownloadMutation.mutate({ id, fileIndex, infoHash });
    },
    [redownloadMutation, id, infoHash]
  );
  const onRecheckPaused = useCallback(() => {
    recheckPausedMutation.mutate({ id, infoHash });
  }, [recheckPausedMutation, id, infoHash]);
  const onRecheck = useCallback(async () => {
    const result = await recheckMutation.mutateAsync({ id, infoHash });
    if (!result) return;
    const notice = describeRecheckOutcome(result, t);
    addNotification(t("torrent.recheck.title"), notice.tone, notice.message);
  }, [recheckMutation, t, id, infoHash]);
  const onUpdateRequest = useCallback(
    async (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => {
      const [origin] = await attempt(torrentApi.getTorrentSource(id, infoHash));
      if (!origin) return;
      ignore(applyTorrentUpdate(item, origin, request.details, request.added));
    },
    [id, infoHash, item]
  );

  return {
    onPause,
    onResume,
    onSeedChange,
    onRemove,
    onUpdateFiles,
    onFilePriorityChange,
    onSetDownloadOrder,
    onSetSequential,
    onRecreate,
    onRedownload,
    onRecheck,
    onRecheckPaused,
    onUpdateRequest,
  };
}
