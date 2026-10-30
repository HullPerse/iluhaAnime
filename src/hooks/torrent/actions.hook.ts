import { useCallback } from "react";

import { torrentApi } from "@/api/torrent.api";
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
import { describeRecheckOutcome } from "@/lib/recheck.utils";
import { applyTorrentUpdate } from "@/lib/torrentUpdate.utils";
import { attempt } from "@/lib/attempt.utils";
import { ignore } from "@/lib/promise.utils";
import { setSeedPreference } from "@/store/cache.store";
import { prepareTorrentDownload } from "@/store/download.store";
import { addNotification } from "@/store/notification.store";
import type {
  FilePriority,
  TorrentDetailFile,
  TorrentDetails,
  TorrentInfo,
  TorrentQueueApply,
} from "@/types/torrent";
import type { TorrentItemActions } from "@/types/actions";

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
      removeMutation.mutate({ id, deleteFiles, infoHash });
    },
    [removeMutation, id, infoHash]
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
  const onSetSequential = useCallback(
    (enabled: boolean) => {
      setSequentialMutation.mutate({ id, enabled, infoHash });
    },
    [setSequentialMutation, id, infoHash]
  );
  const onApplyQueue = useCallback(
    async (payload: TorrentQueueApply) => {
      if (payload.enableSequential) {
        const [, error] = await attempt(
          setSequentialMutation.mutateAsync({ id, enabled: true, infoHash })
        );
        if (error) return false;
      }
      if (payload.selected.length > 0) {
        const [, error] = await attempt(
          setFilePriorityMutation.mutateAsync({
            id,
            fileIndices: payload.selected,
            priority: "normal",
            infoHash,
          })
        );
        if (error) return false;
      }
      if (payload.deselected.length > 0) {
        const [, error] = await attempt(
          setFilePriorityMutation.mutateAsync({
            id,
            fileIndices: payload.deselected,
            priority: "do_not_download",
            infoHash,
          })
        );
        if (error) return false;
      }
      const [, error] = await attempt(
        setDownloadOrderMutation.mutateAsync({ id, indices: payload.order, infoHash })
      );
      return !error;
    },
    [setSequentialMutation, setFilePriorityMutation, setDownloadOrderMutation, id, infoHash]
  );
  const onRecreate = useCallback(async () => {
    const removed = await removeMutation.mutateAsync({
      id,
      deleteFiles: false,
      infoHash,
    });
    if (!removed) return;
    prepareTorrentDownload(`magnet:?xt=urn:btih:${infoHash}`);
  }, [removeMutation, id, infoHash]);
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
    onSetSequential,
    onApplyQueue,
    onRecreate,
    onRedownload,
    onRecheck,
    onRecheckPaused,
    onUpdateRequest,
  };
}
