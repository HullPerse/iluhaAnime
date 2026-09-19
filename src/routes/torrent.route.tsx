import { listen } from "@tauri-apps/api/event";
import { Plus, SortAsc, SortDesc } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { AnimatedNumber } from "@/components/shared/animatedNumber.component";
import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { HostStatsBars } from "@/components/shared/hostStats.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { NO_TORRENT_FILES, NO_TORRENTS, TORRENT_PAGE_SIZE } from "@/config/torrent/common.config";
import { useHostStats } from "@/hooks/hostStats.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import {
  usePauseTorrent,
  useRecheckTorrent,
  useRedownloadFile,
  useRemoveTorrent,
  useResumeTorrent,
  useSetFilePriority,
  useSetSequentialDownload,
  useTorrentFilesMap,
  useTorrents,
  useUpdateOnlyFiles,
} from "@/hooks/torrent/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { applyBulkAction } from "@/lib/torrent/bulk.utils";
import {
  formatSpeed,
  fmtSpeed,
  getLifecycleLabel,
  getTorrentLifecycle,
} from "@/lib/torrent/common.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { useCacheStore } from "@/store/cache.store";
import { useDeepLinkStore } from "@/store/deeplink.store";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentLifecycle } from "@/types/torrent";

import TorrentItem from "./components/torrent/item.torrent";
import AddTorrentModal from "./components/torrent/magnet.torrent";
import SpeedLimitForm from "./components/torrent/speed.torrent";

function TorrentRoute() {
  const { data, isLoading: torrentsLoading } = useTorrents();
  const torrents = data ?? NO_TORRENTS;
  const limits = useTorrentStore((state) => state.limits);
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const removeMutation = useRemoveTorrent();
  const updateOnlyFilesMutation = useUpdateOnlyFiles();
  const setSpeedLimits = useTorrentStore((state) => state.setSpeedLimits);
  const prepareTorrentDownload = useTorrentStore((state) => state.prepareTorrentDownload);
  const prepareTorrentDownloadFromFile = useTorrentStore(
    (state) => state.prepareTorrentDownloadFromFile
  );
  const setFilePriorityMutation = useSetFilePriority();
  const setSequentialMutation = useSetSequentialDownload();
  const setSeedPreference = useCacheStore((state) => state.setSeedPreference);
  const torrentOrder = useCacheStore((state) => state.torrentOrder);
  const syncTorrentOrder = useCacheStore((state) => state.syncTorrentOrder);
  const moveTorrentOrder = useCacheStore((state) => state.moveTorrentOrder);
  const redownloadMutation = useRedownloadFile();
  const recheckMutation = useRecheckTorrent();
  const opInFlight = useTorrentStore((state) => state.opInFlight);

  const [downloadInput, setDownloadInput] = useState(
    limits.download === null ? "" : String(limits.download)
  );
  const [uploadInput, setUploadInput] = useState(
    limits.upload === null ? "" : String(limits.upload)
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showMagnetModal, setShowMagnetModal] = useState(false);
  const [magnetPrefill, setMagnetPrefill] = useState<string | null>(null);
  const torrentTarget = useDeepLinkStore((state) => state.torrentTarget);
  const magnetTarget = useDeepLinkStore((state) => state.magnetTarget);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "progress" | "speed" | "custom">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const hostStats = useHostStats(true);
  const [lifecycleFilter, setLifecycleFilter] = useState<TorrentLifecycle | "all">("all");
  useEffect(() => {
    syncTorrentOrder(torrents.map((t) => t.id));
  }, [torrents, syncTorrentOrder]);

  const lifecycleTorrents = useMemo(() => {
    if (lifecycleFilter === "all") return torrents;
    return torrents.filter((t) => getTorrentLifecycle(t.state, t.finished) === lifecycleFilter);
  }, [torrents, lifecycleFilter]);

  const filteredTorrents = useMemo(() => {
    const list = filterQuery.trim()
      ? lifecycleTorrents.filter((t) => t.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : lifecycleTorrents;
    if (sortBy === "custom") {
      const rank = new Map(torrentOrder.map((id, index) => [id, index]));
      return [...list].sort((a, b) => {
        const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra === rb ? a.id - b.id : ra - rb;
      });
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = a.total_bytes - b.total_bytes;
      else if (sortBy === "progress") cmp = a.progress - b.progress;
      else if (sortBy === "speed") cmp = a.download_speed - b.download_speed;
      return sortAsc ? cmp : -cmp;
    });
  }, [lifecycleTorrents, filterQuery, sortBy, sortAsc, torrentOrder]);

  const { total, from, to, lastPage } = usePagination(
    filteredTorrents.length,
    TORRENT_PAGE_SIZE,
    page,
    setPage
  );
  const queueRank = useMemo(
    () => new Map(filteredTorrents.map((t, index) => [t.id, index])),
    [filteredTorrents]
  );
  const pagedTorrents = useMemo(
    () => paginate(filteredTorrents, page, TORRENT_PAGE_SIZE),
    [filteredTorrents, page]
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const erroredTorrents = useMemo(
    () => filteredTorrents.filter((torrent) => torrent.error),
    [filteredTorrents]
  );
  const runBulk = async (kind: "pause" | "resume" | "retry") => {
    const targets =
      kind === "retry" ? filteredTorrents.filter((torrent) => torrent.error) : filteredTorrents;
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    await attempt(
      (async () => {
        const { done, failed } = await applyBulkAction(targets, (torrent) => {
          if (kind === "pause")
            return pauseMutation.mutateAsync({ id: torrent.id, infoHash: torrent.info_hash });
          if (kind === "resume")
            return resumeMutation.mutateAsync({ id: torrent.id, infoHash: torrent.info_hash });
          return removeMutation
            .mutateAsync({ id: torrent.id, deleteFiles: false, infoHash: torrent.info_hash })
            .then((removed) => {
              if (removed) prepareTorrentDownload(`magnet:?xt=urn:btih:${torrent.info_hash}`);
            });
        });
        useNotificationStore
          .getState()
          .add(
            t("torrent.bulk.title"),
            failed > 0 ? "error" : "success",
            t("torrent.bulk.done", { done, failed })
          );
      })()
    );
    setBulkBusy(false);
  };
  useEffect(() => {
    if (!torrentTarget) return;
    setMagnetPrefill(`magnet:?xt=urn:btih:${torrentTarget.infoHash}`);
    setShowMagnetModal(true);
    useDeepLinkStore.getState().consumeTorrent();
  }, [torrentTarget]);
  useEffect(() => {
    if (!magnetTarget) return;
    setMagnetPrefill(magnetTarget);
    setShowMagnetModal(true);
    useDeepLinkStore.getState().consumeMagnet();
  }, [magnetTarget]);
  // Rows are memoized by `areTorrentItemsEqual`, which intentionally ignores handler
  // identity, so this reads the list through a ref: a memoized row then keeps a correct
  // `onMove` instead of one pinned to the render that created it.
  const filteredTorrentsRef = useRef(filteredTorrents);
  useEffect(() => {
    filteredTorrentsRef.current = filteredTorrents;
  }, [filteredTorrents]);
  const moveQueueItem = useCallback(
    (id: number, delta: -1 | 1) => {
      const list = filteredTorrentsRef.current;
      const index = list.findIndex((t) => t.id === id);
      const neighbor = index === -1 ? undefined : list[index + delta];
      if (!neighbor) return;
      moveTorrentOrder(id, neighbor.id);
    },
    [moveTorrentOrder]
  );
  const visibleIds = useMemo(() => pagedTorrents.map((t) => t.id), [pagedTorrents]);
  const { files: torrentFilesMap, errors: torrentFilesErrors } = useTorrentFilesMap(
    visibleIds,
    2000
  );
  const extraValues = useMemo(() => {
    const names = torrents.map((torrent) => torrent.name);
    return {
      signature: names.join("\u0000"),
      values: names.map((name) => ({
        kind: "torrent" as const,
        value: name,
      })),
    };
  }, [torrents]);
  const field = useSearchField({
    scope: "torrent",
    query: filterQuery,
    setQuery: setFilterQuery,
    extraValues: extraValues.values,
  });

  useEffect(() => {
    setPage(1);
  }, []);

  useEffect(() => {
    setPage((current) => Math.min(current, lastPage));
  }, [lastPage]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const summary = useMemo(() => {
    const active = torrents.filter((item) => !item.finished && item.state === "live").length;
    const seeding = torrents.filter((item) => item.finished && item.state === "live").length;
    return {
      active,
      seeding,
      download: torrents.reduce((total, item) => total + item.download_speed, 0),
      upload: torrents.reduce((total, item) => total + item.upload_speed, 0),
    };
  }, [torrents]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
      for (const path of event.payload.paths) {
        if (path.toLowerCase().endsWith(".torrent")) {
          prepareTorrentDownloadFromFile(path);
          break;
        }
      }
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => reportBackgroundError("drag-drop.listen", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [prepareTorrentDownloadFromFile]);

  useEffect(() => {
    const { limits: prefs } = useSettingsStore.getState();
    if (prefs.download !== null || prefs.upload !== null) {
      setSpeedLimits(prefs);
    }
  }, [setSpeedLimits]);

  useEffect(() => {
    const totalDl = torrents.reduce((s, t) => s + t.download_speed, 0);
    const totalUl = torrents.reduce((s, t) => s + t.upload_speed, 0);
    const suffix =
      totalDl > 0 || totalUl > 0
        ? ` download ${fmtSpeed(totalDl)} upload ${fmtSpeed(totalUl)}`
        : "";
    const next = `iluhaAnime${suffix}`;
    if (document.title !== next) document.title = next;
  }, [torrents]);

  const applySpeedLimits = useCallback(() => {
    const download = downloadInput === "" ? null : Number(downloadInput);
    const upload = uploadInput === "" ? null : Number(uploadInput);
    if (download !== null && (isNaN(download) || download <= 0)) return;
    if (upload !== null && (isNaN(upload) || upload <= 0)) return;
    setSpeedLimits({ download, upload });
  }, [downloadInput, uploadInput, setSpeedLimits]);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-y-auto">
      <SpeedLimitForm
        limits={limits}
        downloadInput={downloadInput}
        uploadInput={uploadInput}
        onDownloadChange={setDownloadInput}
        onUploadChange={setUploadInput}
        onApply={applySpeedLimits}
      />
      <section
        className="windows95-active-border bg-primary flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1"
        role="status"
        aria-live="polite"
      >
        <span className="windows95-text text-xs">
          {t("torrent.summary.total", { count: torrents.length })}
        </span>
        <span className="windows95-text text-highlight text-xs">
          {t("torrent.summary.active", { count: summary.active })}
        </span>
        <span className="windows95-text text-success text-xs">
          {t("torrent.summary.seeding", { count: summary.seeding })}
        </span>
        <span className="windows95-text ml-auto text-xs">
          {t("torrent.summary.download.label")}{" "}
          <AnimatedNumber value={summary.download} format={formatSpeed} />
        </span>
        <span className="windows95-text text-xs">
          {t("torrent.summary.upload.label")}{" "}
          <AnimatedNumber value={summary.upload} format={formatSpeed} />
        </span>
        <HostStatsBars stats={hostStats} />
      </section>
      <section className="windows95-active-border bg-primary flex flex-wrap items-center gap-1 p-0.5">
        {(["all", "staging", "live", "paused", "seeding", "completed"] as const).map((lc) => (
          <Button
            key={lc}
            variant={lifecycleFilter === lc ? "outline" : "default"}
            size="default"
            className="px-1 py-0.5 text-xs"
            aria-pressed={lifecycleFilter === lc}
            onClick={() => setLifecycleFilter(lc)}
          >
            {lc === "all" ? t("torrent.all") : getLifecycleLabel(lc, t)}
          </Button>
        ))}
      </section>
      <section className="windows95-active-border bg-primary flex flex-wrap items-center gap-2 p-1">
        <InlineAutocompleteInput
          className="ml-2 w-32 font-bold"
          placeholder={t("torrent.filter.placeholder")}
          {...field.inputProps}
        />
        <Select
          className="h-6 w-24"
          value={sortBy}
          onChange={(v) => setSortBy(v as typeof sortBy)}
          options={[
            { value: "name", label: t("torrent.sort.name") },
            { value: "size", label: t("torrent.sort.size") },
            { value: "progress", label: t("torrent.sort.progress") },
            { value: "speed", label: t("torrent.sort.speed") },
            { value: "custom", label: t("torrent.sort.custom") },
          ]}
        />
        <Button
          size="icon"
          className="size-5"
          onClick={() => setSortAsc((v) => !v)}
          disabled={sortBy === "custom"}
          title={sortAsc ? t("torrent.sort.asc") : t("torrent.sort.desc")}
        >
          {sortAsc ? <SortAsc className="size-3" /> : <SortDesc className="size-3" />}
        </Button>
        <Button
          className="windows95-text flex items-center"
          onClick={() => setShowMagnetModal(true)}
        >
          <Plus className="size-4" />
          {t("torrent.add.magnet")}
        </Button>
        <Button
          className="windows95-text flex items-center"
          disabled={bulkBusy || filteredTorrents.length === 0}
          onClick={() => runBulk("pause")}
        >
          {t("torrent.bulk.pause.all")}
        </Button>
        <Button
          className="windows95-text flex items-center"
          disabled={bulkBusy || filteredTorrents.length === 0}
          onClick={() => runBulk("resume")}
        >
          {t("torrent.bulk.resume.all")}
        </Button>
        <Button
          className="windows95-text flex items-center"
          disabled={bulkBusy || erroredTorrents.length === 0}
          onClick={() => runBulk("retry")}
        >
          {t("torrent.bulk.retry.errors")}
        </Button>
      </section>

      {torrentsLoading && total === 0 && (
        <section
          aria-busy
          className="windows95-border bg-primary flex min-h-0 w-full flex-1 items-center justify-center p-1"
        >
          <SmallLoader size={6} />
        </section>
      )}
      {total > 0 && (
        <section
          ref={listRef}
          className="windows95-border bg-primary flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-1"
        >
          {pagedTorrents.map((item) => {
            const isExpanded = expanded.has(item.id);
            const files = torrentFilesMap[item.id] ?? NO_TORRENT_FILES;
            const queueIndex = queueRank.get(item.id) ?? 0;

            return (
              <TorrentItem
                key={item.id}
                item={item}
                files={files}
                filesError={torrentFilesErrors[item.id]}
                isExpanded={isExpanded}
                busy={opInFlight[item.id] !== undefined}
                queue={
                  sortBy === "custom"
                    ? {
                        index: queueIndex,
                        total: filteredTorrents.length,
                        onMove: (delta) => moveQueueItem(item.id, delta),
                      }
                    : null
                }
                onToggleExpand={() => toggleExpanded(item.id)}
                onPause={() => pauseMutation.mutate({ id: item.id, infoHash: item.info_hash })}
                onResume={() => resumeMutation.mutate({ id: item.id, infoHash: item.info_hash })}
                onSeedChange={(enabled) => {
                  setSeedPreference(item.id, enabled);
                  if (enabled) resumeMutation.mutate({ id: item.id, infoHash: item.info_hash });
                  else pauseMutation.mutate({ id: item.id, infoHash: item.info_hash });
                }}
                onRemove={(deleteFiles) =>
                  removeMutation.mutate({ id: item.id, deleteFiles, infoHash: item.info_hash })
                }
                onUpdateFiles={(indices) =>
                  updateOnlyFilesMutation.mutate({ id: item.id, indices, infoHash: item.info_hash })
                }
                onFilePriorityChange={(indices, priority) =>
                  setFilePriorityMutation.mutate({
                    id: item.id,
                    fileIndices: indices,
                    priority,
                    infoHash: item.info_hash,
                  })
                }
                onSetSequential={(enabled) =>
                  setSequentialMutation.mutate({ id: item.id, enabled, infoHash: item.info_hash })
                }
                onRetry={async () => {
                  const removed = await removeMutation.mutateAsync({
                    id: item.id,
                    deleteFiles: false,
                    infoHash: item.info_hash,
                  });
                  if (!removed) return;
                  const magnet = `magnet:?xt=urn:btih:${item.info_hash}`;
                  prepareTorrentDownload(magnet);
                }}
                onRedownload={(fileIndex) =>
                  redownloadMutation.mutate({ id: item.id, fileIndex, infoHash: item.info_hash })
                }
                onRecheck={async () => {
                  const result = await recheckMutation.mutateAsync({
                    id: item.id,
                    infoHash: item.info_hash,
                  });
                  if (!result) return;
                  const { add } = useNotificationStore.getState();
                  if (result.missing.length === 0 && result.size_mismatch.length === 0) {
                    add(
                      t("torrent.recheck.title"),
                      "success",
                      t("torrent.recheck.ok", {
                        ok: result.ok,
                        total: result.total,
                      })
                    );
                  } else {
                    const parts: string[] = [];
                    if (result.missing.length)
                      parts.push(
                        t("torrent.recheck.missing", {
                          count: result.missing.length,
                        })
                      );
                    if (result.size_mismatch.length)
                      parts.push(
                        t("torrent.recheck.size", {
                          count: result.size_mismatch.length,
                        })
                      );
                    add(
                      t("torrent.recheck.title"),
                      "error",
                      `${parts.join("; ")} ${t("torrent.recheck.summary", {
                        ok: result.ok,
                        total: result.total,
                      })}`
                    );
                  }
                }}
              />
            );
          })}
        </section>
      )}
      {total > 0 && (
        <Pagination
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          statusText={t("torrent.summary.total", { count: total })}
        />
      )}
      {showMagnetModal && (
        <AddTorrentModal
          open={showMagnetModal}
          initialMagnet={magnetPrefill}
          onClose={() => {
            setShowMagnetModal(false);
            setMagnetPrefill(null);
          }}
          onAddMagnet={(magnet) => prepareTorrentDownload(magnet)}
          onAddFile={(path) => prepareTorrentDownloadFromFile(path)}
        />
      )}
    </div>
  );
}

export default TorrentRoute;
