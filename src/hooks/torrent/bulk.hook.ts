import { useCallback, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { useI18n } from "@/hooks/i18n.hook";
import {
  useAddTorrentTracker,
  usePauseTorrent,
  useRecheckTorrent,
  useRemoveTorrent,
  useResumeTorrent,
} from "@/hooks/torrent/queries.hook";
import { attempt } from "@hullperse/hp_utils/attempt";
import { BULK_CONCURRENCY, applyBulkAction, splitRecheckOutcome } from "@/lib/core/collection/bulk.utils";
import { attemptAllLimit } from "@hullperse/hp_utils/result";
import { prepareTorrentDownload } from "@/store/download.store";
import { addNotification } from "@/store/notification.store";
import type { TorrentBulkKind, TorrentBulkPayload } from "@/types/torrent/bulk";
import type { TorrentInfo } from "@/types/torrent/torrent";

interface TorrentBulkApi {
  bulkBusy: boolean;
  recreateTargets: TorrentInfo[];
  setRecreateTargets: (targets: TorrentInfo[]) => void;
  recreateTorrents: (targets: TorrentInfo[]) => Promise<void>;
  runBulk: (
    kind: TorrentBulkKind,
    targets: TorrentInfo[],
    deleteFiles?: boolean,
    payload?: TorrentBulkPayload
  ) => Promise<void>;
}

export function useTorrentBulk(): TorrentBulkApi {
  const { t } = useI18n();
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const removeMutation = useRemoveTorrent();
  const recheckMutation = useRecheckTorrent();
  const addTrackerMutation = useAddTorrentTracker();
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [recreateTargets, setRecreateTargets] = useState<TorrentInfo[]>([]);

  const recreateTorrents = useCallback(
    async (targets: TorrentInfo[]) => {
      await applyBulkAction(targets, (torrent) =>
        removeMutation
          .mutateAsync({
            id: torrent.id,
            deleteFiles: false,
            infoHash: torrent.info_hash,
          })
          .then((removed) => {
            if (removed) prepareTorrentDownload(`magnet:?xt=urn:btih:${torrent.info_hash}`);
            return null;
          })
      );
    },
    [removeMutation]
  );

  const runBulk = useCallback(
    async (
      kind: TorrentBulkKind,
      targets: TorrentInfo[],
      deleteFiles = false,
      payload?: TorrentBulkPayload
    ) => {
      if (targets.length === 0 || bulkBusy) return;
      setBulkBusy(true);
      const total = targets.length;
      const reportFailures = (done: number) => {
        if (done >= total) return;
        addNotification(
          t("torrent.bulk.title"),
          "error",
          t("torrent.bulk.done", { done, failed: total - done })
        );
      };
      await attempt(
        (async () => {
          if (kind === "remove") {
            const outcomes = await attemptAllLimit(targets, BULK_CONCURRENCY, (torrent) =>
              removeMutation.mutateAsync({
                id: torrent.id,
                deleteFiles,
                infoHash: torrent.info_hash,
                silent: true,
              })
            );
            const done = outcomes.filter((outcome) => outcome.ok && Boolean(outcome.value)).length;
            reportFailures(done);
            return;
          }
          if (kind === "recheck") {
            const results = await Promise.all(
              targets.map((torrent) =>
                recheckMutation.mutateAsync({
                  id: torrent.id,
                  infoHash: torrent.info_hash,
                  silent: true,
                })
              )
            );
            const { lost, failed } = splitRecheckOutcome(targets, results);
            if (failed > 0) {
              addNotification(
                t("torrent.bulk.title"),
                "error",
                t("torrent.bulk.recheck.done", {
                  done: targets.length - failed,
                  failed,
                })
              );
            }
            if (lost.length > 0) setRecreateTargets(lost);
            return;
          }
          if (kind === "trackers" && payload?.tracker !== undefined) {
            const tracker = payload.tracker;
            const { done, failed } = await applyBulkAction(targets, (torrent) =>
              addTrackerMutation.mutateAsync({
                id: torrent.id,
                tracker,
                infoHash: torrent.info_hash,
                silent: true,
              })
            );
            if (failed > 0)
              addNotification(
                t("torrent.bulk.title"),
                "error",
                t("torrent.bulk.done", { done, failed })
              );
            return;
          }
          if (kind === "limits") {
            const downloadBps =
              payload?.downloadBps != null ? Math.round(payload.downloadBps * 1024) : null;
            const uploadBps =
              payload?.uploadBps != null ? Math.round(payload.uploadBps * 1024) : null;
            const { done, failed } = await applyBulkAction(targets, (torrent) =>
              torrentApi.setTorrentLimits(torrent.id, { downloadBps, uploadBps }, torrent.info_hash)
            );
            if (failed > 0)
              addNotification(
                t("torrent.bulk.title"),
                "error",
                t("torrent.bulk.done", { done, failed })
              );
            return;
          }
          const { done, failed } = await applyBulkAction(targets, (torrent) =>
            kind === "pause"
              ? pauseMutation.mutateAsync({
                  id: torrent.id,
                  infoHash: torrent.info_hash,
                  silent: true,
                })
              : resumeMutation.mutateAsync({
                  id: torrent.id,
                  infoHash: torrent.info_hash,
                  silent: true,
                })
          );
          if (failed > 0)
            addNotification(
              t("torrent.bulk.title"),
              "error",
              t("torrent.bulk.done", { done, failed })
            );
        })()
      );
      setBulkBusy(false);
    },
    [
      addTrackerMutation,
      bulkBusy,
      pauseMutation,
      recheckMutation,
      removeMutation,
      resumeMutation,
      t,
    ]
  );

  return {
    bulkBusy,
    recreateTargets,
    setRecreateTargets,
    recreateTorrents,
    runBulk,
  };
}
