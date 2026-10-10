import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, SortAsc, SortDesc } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { torrentApi } from "@/api/torrent.api";
import { AnimatedNumber } from "@/components/shared/animatedNumber.component";
import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { HostStatsBars } from "@/components/shared/hostStats.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { NO_TORRENT_FILES, NO_TORRENTS, TORRENT_PAGE_SIZE } from "@/config/torrent/common.config";
import { useHostStats } from "@/hooks/hostStats.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import {
  TORRENTS_QUERY_KEY,
  useAddTorrentTracker,
  usePauseTorrent,
  useRecheckTorrent,
  useRemoveTorrent,
  useResumeTorrent,
  useTorrentFilesMap,
  useTorrentListenPort,
  useDhtStats,
  useTorrents,
} from "@/hooks/torrent/queries.hook";
import { useCell } from "@/lib/state/signal.hook";
import {
  BULK_CONCURRENCY,
  applyBulkAction,
  pruneSelection,
  splitRecheckOutcome,
} from "@/lib/torrent/bulk.utils";
import {
  formatSpeed,
  fmtSpeed,
  getLifecycleLabel,
  getTorrentLifecycle,
} from "@/lib/torrent/common.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { attemptAllLimit } from "@/lib/utils/result.utils";
import {
  cacheAtoms,
  moveTorrentOrder,
  moveTorrentOrderTo,
  setSeedPreference,
  syncTorrentOrder,
} from "@/store/cache.store";
import {
  consumeMagnetDeepLink,
  consumeTorrentDeepLink,
  deeplinkAtoms,
} from "@/store/deeplink.store";
import {
  prepareTorrentDownload,
  queueTorrentFiles,
  setTorrentSpeedLimits as setSpeedLimits,
  torrentAtoms,
} from "@/store/download.store";
import { addNotification, updateNotification } from "@/store/notification.store";
import { getSettingsSnapshot } from "@/store/settings.store";
import type { TorrentInfo, TorrentLifecycle } from "@/types/torrent";

import { BulkLimitsModal, BulkTrackerModal } from "./components/torrent/bulk.torrent";
import CreateTorrentModal from "./components/torrent/create.torrent";
import { SpeedGraph } from "./components/torrent/graph.torrent";
import AddTorrentModal from "./components/torrent/magnet.torrent";
import { TorrentRow } from "./components/torrent/row.torrent";
import { DeleteTorrentDialog } from "./components/torrent/sections/delete.sections";
import { TorrentSelectionBar } from "./components/torrent/sections/selection.sections";
import SpeedLimitForm from "./components/torrent/speed.torrent";

function TorrentRoute() {
  const queryClient = useQueryClient();
  const { data, isLoading: torrentsLoading } = useTorrents();
  const torrents = data ?? NO_TORRENTS;
  const limits = useCell(torrentAtoms.limits);
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const removeMutation = useRemoveTorrent();
  const torrentOrder = useCell(cacheAtoms.torrentOrder);
  const recheckMutation = useRecheckTorrent();
  const addTrackerMutation = useAddTorrentTracker();
  const opInFlight = useCell(torrentAtoms.opInFlight);
  const { data: listenPort } = useTorrentListenPort();
  const { data: dhtStats } = useDhtStats();

  const [downloadInput, setDownloadInput] = useState(
    limits.download === null ? "" : String(limits.download)
  );
  const [uploadInput, setUploadInput] = useState(
    limits.upload === null ? "" : String(limits.upload)
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMagnetModal, setShowMagnetModal] = useState(false);
  const [magnetPrefill, setMagnetPrefill] = useState<string | null>(null);
  const torrentTarget = useCell(deeplinkAtoms.torrentTarget);
  const magnetTarget = useCell(deeplinkAtoms.magnetTarget);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "progress" | "speed" | "custom">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const hostStats = useHostStats(true);
  const [lifecycleFilter, setLifecycleFilter] = useState<TorrentLifecycle | "all">("all");
  const queueSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  useEffect(() => {
    syncTorrentOrder(torrents.map((t) => t.id));
  }, [torrents]);

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
  const [recreateTargets, setRecreateTargets] = useState<TorrentInfo[]>([]);
  const problemTorrents = useMemo(
    () => filteredTorrents.filter((torrent) => torrent.error || torrent.missing_files),
    [filteredTorrents]
  );
  const selectedTorrents = useMemo(
    () => filteredTorrents.filter((torrent) => selected.has(torrent.id)),
    [filteredTorrents, selected]
  );
  useEffect(() => {
    setSelected((prev) => pruneSelection(prev, filteredTorrents));
    setExpanded((prev) => {
      const pruned = pruneSelection(prev, filteredTorrents);
      return pruned === prev ? prev : new Set(pruned);
    });
  }, [filteredTorrents]);
  const [bulkRemoveTargets, setBulkRemoveTargets] = useState<TorrentInfo[] | null>(null);
  const [showBulkTrackers, setShowBulkTrackers] = useState(false);
  const [showBulkLimits, setShowBulkLimits] = useState(false);
  const recreateTorrents = (targets: TorrentInfo[]) =>
    applyBulkAction(targets, (torrent) =>
      removeMutation
        .mutateAsync({
          id: torrent.id,
          deleteFiles: false,
          infoHash: torrent.info_hash,
          name: torrent.name,
          silent: true,
        })
        .then((removed) => {
          if (removed) prepareTorrentDownload(`magnet:?xt=urn:btih:${torrent.info_hash}`);
        })
    );
  const runBulk = async (
    kind: "pause" | "resume" | "recheck" | "remove" | "trackers" | "limits",
    targets: TorrentInfo[],
    deleteFiles = false,
    payload?: { tracker?: string; downloadBps?: number | null; uploadBps?: number | null }
  ) => {
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    const total = targets.length;
    const noticeId = addNotification(
      t("torrent.bulk.title"),
      "info",
      t("torrent.bulk.progress", { count: total, done: 0 }),
      `torrent-bulk:${kind}:${Date.now()}`,
      { system: false }
    );
    if (noticeId > 0) updateNotification(noticeId, { progress: true });
    let finished = 0;
    const track = <T,>(work: Promise<T>): Promise<T> =>
      work.finally(() => {
        finished += 1;
        if (noticeId > 0)
          updateNotification(noticeId, {
            message: t("torrent.bulk.progress", { count: total, done: finished }),
          });
      });
    const finishBulk = (type: "success" | "error", message: string) => {
      if (noticeId > 0)
        updateNotification(noticeId, { message, progress: false, type }, { system: true });
      else addNotification(t("torrent.bulk.title"), type, message);
    };
    await attempt(
      (async () => {
        if (kind === "remove") {
          const outcomes = await attemptAllLimit(targets, BULK_CONCURRENCY, (torrent) =>
            track(
              removeMutation
                .mutateAsync({
                  id: torrent.id,
                  deleteFiles,
                  infoHash: torrent.info_hash,
                  name: torrent.name,
                  silent: true,
                })
                .catch(() => false)
            )
          );
          const done = outcomes.filter((outcome) => outcome.ok && Boolean(outcome.value)).length;
          finishBulk(
            done === total ? "success" : "error",
            t("torrent.bulk.done", { done, failed: total - done })
          );
          return;
        }
        if (kind === "recheck") {
          const results = await Promise.all(
            targets.map((torrent) =>
              track(recheckMutation.mutateAsync({ id: torrent.id, infoHash: torrent.info_hash }))
            )
          );
          const { lost, failed } = splitRecheckOutcome(targets, results);
          finishBulk(
            failed > 0 ? "error" : "success",
            t("torrent.bulk.recheck.done", {
              done: targets.length - failed,
              failed,
            })
          );
          if (lost.length > 0) setRecreateTargets(lost);
          return;
        }
        if (kind === "trackers" && payload?.tracker) {
          const tracker = payload.tracker;
          const { done, failed } = await applyBulkAction(targets, (torrent) =>
            track(
              addTrackerMutation.mutateAsync({
                id: torrent.id,
                tracker,
                infoHash: torrent.info_hash,
              })
            )
          );
          finishBulk(failed > 0 ? "error" : "success", t("torrent.bulk.done", { done, failed }));
          return;
        }
        if (kind === "limits") {
          const downloadBps =
            payload?.downloadBps != null ? Math.round(payload.downloadBps * 1024) : null;
          const uploadBps =
            payload?.uploadBps != null ? Math.round(payload.uploadBps * 1024) : null;
          const { done, failed } = await applyBulkAction(targets, (torrent) =>
            track(
              torrentApi
                .setTorrentLimits(torrent.id, { downloadBps, uploadBps }, torrent.info_hash)
                .then(() => true)
                .catch(() => false)
            )
          );
          finishBulk(failed > 0 ? "error" : "success", t("torrent.bulk.done", { done, failed }));
          return;
        }
        const { done, failed } = await applyBulkAction(targets, (torrent) =>
          track(
            kind === "pause"
              ? pauseMutation.mutateAsync({ id: torrent.id, infoHash: torrent.info_hash })
              : resumeMutation.mutateAsync({ id: torrent.id, infoHash: torrent.info_hash })
          )
        );
        finishBulk(failed > 0 ? "error" : "success", t("torrent.bulk.done", { done, failed }));
      })()
    );
    setBulkBusy(false);
  };
  useEffect(() => {
    if (!torrentTarget) return;
    setMagnetPrefill(`magnet:?xt=urn:btih:${torrentTarget.infoHash}`);
    setShowMagnetModal(true);
    consumeTorrentDeepLink();
  }, [torrentTarget]);
  useEffect(() => {
    if (!magnetTarget) return;
    setMagnetPrefill(magnetTarget);
    setShowMagnetModal(true);
    consumeMagnetDeepLink();
  }, [magnetTarget]);
  const filteredTorrentsRef = useRef(filteredTorrents);
  useEffect(() => {
    filteredTorrentsRef.current = filteredTorrents;
  }, [filteredTorrents]);
  const moveQueueItem = useCallback((id: number, delta: -1 | 1) => {
    const list = filteredTorrentsRef.current;
    const index = list.findIndex((t) => t.id === id);
    const neighbor = index === -1 ? undefined : list[index + delta];
    if (!neighbor) return;
    moveTorrentOrder(id, neighbor.id);
  }, []);
  const handleQueueDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    moveTorrentOrderTo(Number(active.id), Number(over.id));
  }, []);
  const visibleIds = useMemo(() => pagedTorrents.map((t) => t.id), [pagedTorrents]);
  const expandedIds = useMemo(
    () => new Set(visibleIds.filter((id) => expanded.has(id))),
    [visibleIds, expanded]
  );
  const { files: torrentFilesMap, errors: torrentFilesErrors } = useTorrentFilesMap(
    visibleIds,
    5000,
    expandedIds
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
      peers: torrents.reduce((total, item) => total + item.peers_connected, 0),
      download: torrents.reduce((total, item) => total + item.download_speed, 0),
      upload: torrents.reduce((total, item) => total + item.upload_speed, 0),
    };
  }, [torrents]);

  useTauriEvent<{ paths: string[] }>(
    "tauri://drag-drop",
    (event) => {
      const files = event.payload.paths.filter((path) => path.toLowerCase().endsWith(".torrent"));
      if (files.length > 0) queueTorrentFiles(files);
    },
    { errorTag: "drag-drop" }
  );

  useEffect(() => {
    const { limits: prefs } = getSettingsSnapshot();
    if (prefs.download !== null || prefs.upload !== null) {
      setSpeedLimits(prefs);
    }
  }, []);

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
  }, [downloadInput, uploadInput]);

  const toggleSelected = useCallback((id: number, value: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

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
        {typeof listenPort === "number" && listenPort > 0 && (
          <span className="windows95-text text-hint text-xs">
            {t("torrent.listen.port", { port: listenPort })}
          </span>
        )}
        <HostStatsBars stats={hostStats} />
      </section>
      <SpeedGraph
        download={summary.download}
        upload={summary.upload}
        peers={summary.peers}
        dht={dhtStats}
      />
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
          onClick={() => setShowCreateModal(true)}
        >
          {t("torrent.create.confirm")}
        </Button>
        <Button
          className="windows95-text flex items-center"
          disabled={bulkBusy || problemTorrents.length === 0}
          onClick={() => runBulk("recheck", problemTorrents)}
        >
          {t("torrent.bulk.recheck.errors")}
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
        <DndContext sensors={queueSensors} onDragEnd={handleQueueDragEnd}>
          <section
            ref={listRef}
            className="windows95-border bg-primary flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-1"
          >
            {pagedTorrents.map((item) => (
              <TorrentRow
                key={item.id}
                item={item}
                files={torrentFilesMap[item.id] ?? NO_TORRENT_FILES}
                filesError={torrentFilesErrors[item.id]}
                isExpanded={expanded.has(item.id)}
                selected={selected.has(item.id)}
                busy={opInFlight[item.id] !== undefined}
                queueIndex={queueRank.get(item.id) ?? 0}
                queueTotal={filteredTorrents.length}
                queueEnabled={sortBy === "custom"}
                onMoveQueue={moveQueueItem}
                onToggleExpand={() => toggleExpanded(item.id)}
                onSelectChange={(value) => toggleSelected(item.id, value)}
              />
            ))}
          </section>
        </DndContext>
      )}
      {selected.size > 0 && (
        <TorrentSelectionBar
          count={selected.size}
          busy={bulkBusy}
          onPause={() => runBulk("pause", selectedTorrents)}
          onResume={() => runBulk("resume", selectedTorrents)}
          onRecheck={() => runBulk("recheck", selectedTorrents)}
          onDelete={() => setBulkRemoveTargets(selectedTorrents)}
          onTrackers={() => setShowBulkTrackers(true)}
          onLimits={() => setShowBulkLimits(true)}
          onSelectAll={() => setSelected(new Set(filteredTorrents.map((torrent) => torrent.id)))}
          onClear={() => setSelected(new Set())}
        />
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
      {bulkRemoveTargets && bulkRemoveTargets.length > 0 && (
        <DeleteTorrentDialog
          open
          message={t("torrent.delete.message.many")}
          onWithFiles={() => {
            const targets = bulkRemoveTargets;
            setBulkRemoveTargets(null);
            runBulk("remove", targets, true);
          }}
          onKeepFiles={() => {
            const targets = bulkRemoveTargets;
            setBulkRemoveTargets(null);
            runBulk("remove", targets, false);
          }}
          onClose={() => setBulkRemoveTargets(null)}
        />
      )}
      <BulkTrackerModal
        open={showBulkTrackers}
        busy={bulkBusy}
        onClose={() => setShowBulkTrackers(false)}
        onApply={(tracker) => {
          setShowBulkTrackers(false);
          ignore(runBulk("trackers", selectedTorrents, false, { tracker }));
        }}
      />
      <BulkLimitsModal
        open={showBulkLimits}
        busy={bulkBusy}
        onClose={() => setShowBulkLimits(false)}
        onApply={(limits) => {
          setShowBulkLimits(false);
          ignore(
            runBulk("limits", selectedTorrents, false, {
              downloadBps: limits.download,
              uploadBps: limits.upload,
            })
          );
        }}
      />
      {recreateTargets.length > 0 && (
        <ConfirmDialog
          open
          title={t("torrent.recreate.title")}
          message={t("torrent.bulk.recreate.message", { count: recreateTargets.length })}
          confirmLabel={t("torrent.recreate.confirm")}
          variant="destructive"
          onConfirm={() => {
            const targets = recreateTargets;
            setRecreateTargets([]);
            recreateTorrents(targets).catch((error) =>
              reportBackgroundError("torrent.recreate", error)
            );
          }}
          onCancel={() => setRecreateTargets([])}
          onClose={() => setRecreateTargets([])}
        />
      )}
      {showCreateModal && (
        <CreateTorrentModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setSeedPreference(created.id, true);
            queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
          }}
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
          onAddFiles={(paths) => queueTorrentFiles(paths)}
        />
      )}
    </div>
  );
}

export default TorrentRoute;
