import { listen } from "@tauri-apps/api/event";
import { Plus, SortAsc, SortDesc } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { TORRENT_PAGE_SIZE } from "@/config/torrent/common.config";
import { usePagination } from "@/hooks/pagination.hook";
import { usePolling } from "@/hooks/polling.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { fmtSpeed, getTorrentLifecycle, getLifecycleLabel } from "@/lib/torrent/common.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { useCacheStore } from "@/store/cache.store";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentLifecycle } from "@/types/torrent";

import TorrentItem from "./components/torrent/item.torrent";
import AddTorrentModal from "./components/torrent/magnet.torrent";
import SpeedLimitForm from "./components/torrent/speed.torrent";

function TorrentRoute() {
  const torrents = useTorrentStore((state) => state.torrents);
  const limits = useTorrentStore((state) => state.limits);
  const torrentFilesMap = useTorrentStore((state) => state.torrentFilesMap);
  const pauseTorrent = useTorrentStore((state) => state.pauseTorrent);
  const resumeTorrent = useTorrentStore((state) => state.resumeTorrent);
  const removeTorrent = useTorrentStore((state) => state.removeTorrent);
  const setSpeedLimits = useTorrentStore((state) => state.setSpeedLimits);
  const updateTorrentOnlyFiles = useTorrentStore((state) => state.updateTorrentOnlyFiles);
  const prepareTorrentDownload = useTorrentStore((state) => state.prepareTorrentDownload);
  const prepareTorrentDownloadFromFile = useTorrentStore(
    (state) => state.prepareTorrentDownloadFromFile
  );
  const setFilePriority = useTorrentStore((state) => state.setFilePriority);
  const setSequentialDownload = useTorrentStore((state) => state.setSequentialDownload);
  const setSeedPreference = useCacheStore((state) => state.setSeedPreference);
  const redownloadFile = useTorrentStore((state) => state.redownloadFile);
  const recheckTorrent = useTorrentStore((state) => state.recheckTorrent);

  const [downloadInput, setDownloadInput] = useState(
    limits.download === null ? "" : String(limits.download)
  );
  const [uploadInput, setUploadInput] = useState(
    limits.upload === null ? "" : String(limits.upload)
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showMagnetModal, setShowMagnetModal] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "progress" | "speed">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLElement>(null);
  const { t } = useI18n();

  const [lifecycleFilter, setLifecycleFilter] = useState<TorrentLifecycle | "all">("all");

  const lifecycleTorrents = useMemo(() => {
    if (lifecycleFilter === "all") return torrents;
    return torrents.filter((t) => getTorrentLifecycle(t.state, t.finished) === lifecycleFilter);
  }, [torrents, lifecycleFilter]);

  const filteredTorrents = useMemo(() => {
    const list = filterQuery.trim()
      ? lifecycleTorrents.filter((t) => t.name.toLowerCase().includes(filterQuery.toLowerCase()))
      : lifecycleTorrents;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = a.total_bytes - b.total_bytes;
      else if (sortBy === "progress") cmp = a.progress - b.progress;
      else if (sortBy === "speed") cmp = a.download_speed - b.download_speed;
      return sortAsc ? cmp : -cmp;
    });
  }, [lifecycleTorrents, filterQuery, sortBy, sortAsc]);

  const { total, from, to, lastPage } = usePagination(
    filteredTorrents.length,
    TORRENT_PAGE_SIZE,
    page,
    setPage
  );
  const pagedTorrents = useMemo(
    () => paginate(filteredTorrents, page, TORRENT_PAGE_SIZE),
    [filteredTorrents, page]
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
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [prepareTorrentDownloadFromFile]);

  usePolling({
    intervalMs: 5000,
    collectKeys: () => useTorrentStore.getState().torrents.map((t) => t.id),
    shouldFetch: (id) => !useTorrentStore.getState().torrentFilesMap[id],
    fetch: (id) => useTorrentStore.getState().loadTorrentFiles(id),
  });

  usePolling({
    intervalMs: 2000,
    enabled: expanded.size > 0,
    collectKeys: () =>
      useTorrentStore
        .getState()
        .torrents.filter((t) => expanded.has(t.id))
        .map((t) => t.id),
    shouldFetch: (id) => Boolean(useTorrentStore.getState().torrentFilesMap[id]),
    fetch: (id) => useTorrentStore.getState().loadTorrentFiles(id),
  });

  useEffect(() => {
    const handleFocus = () => {
      const state = useTorrentStore.getState();
      state.torrents.forEach((t) => {
        if (state.torrentFilesMap[t.id]) {
          state.loadTorrentFiles(t.id);
        }
      });
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

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
    document.title = `iluhaAnime${suffix}`;
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
          {t("torrent.summary.download", {
            speed: fmtSpeed(summary.download) || "0 B/s",
          })}
        </span>
        <span className="windows95-text text-xs">
          {t("torrent.summary.upload", {
            speed: fmtSpeed(summary.upload) || "0 B/s",
          })}
        </span>
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
          ]}
        />
        <Button
          size="icon"
          className="size-5"
          onClick={() => setSortAsc((v) => !v)}
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
      </section>

      {total > 0 && (
        <section
          ref={listRef}
          className="windows95-border bg-primary flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-1"
        >
          {pagedTorrents.map((item) => {
            const isExpanded = expanded.has(item.id);
            const files = torrentFilesMap[item.id];

            return (
              <TorrentItem
                key={item.id}
                item={item}
                files={files}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleExpanded(item.id)}
                onPause={() => pauseTorrent(item.id)}
                onResume={() => resumeTorrent(item.id)}
                onSeedChange={(enabled) => {
                  setSeedPreference(item.id, enabled);
                  if (enabled) resumeTorrent(item.id);
                  else pauseTorrent(item.id);
                }}
                onRemove={(deleteFiles) => removeTorrent(item.id, deleteFiles)}
                onUpdateFiles={(indices) => updateTorrentOnlyFiles(item.id, indices)}
                onFilePriorityChange={(indices, priority) =>
                  setFilePriority(item.id, indices, priority)
                }
                onSetSequential={(enabled) => setSequentialDownload(item.id, enabled)}
                onRetry={async () => {
                  await removeTorrent(item.id, false);
                  const magnet = `magnet:?xt=urn:btih:${item.info_hash}`;
                  prepareTorrentDownload(magnet);
                }}
                onRedownload={(fileIndex) => redownloadFile(item.id, fileIndex, item.info_hash)}
                onRecheck={async () => {
                  const result = await recheckTorrent(item.id);
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
          onClose={() => setShowMagnetModal(false)}
          onAddMagnet={(magnet) => prepareTorrentDownload(magnet)}
          onAddFile={(path) => prepareTorrentDownloadFromFile(path)}
        />
      )}
    </div>
  );
}

export default TorrentRoute;
