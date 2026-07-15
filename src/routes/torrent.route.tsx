import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { fmtSpeed } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "@/store/settings.store";
import { useNotificationStore } from "@/store/notification.store";
import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, SortAsc, SortDesc } from "lucide-react";

import SpeedLimitForm from "./components/torrent/speed.torrent";
import AddTorrentModal from "./components/torrent/magnet.torrent";
import TorrentItem from "./components/torrent/item.torrent";
import {
  getTorrentLifecycle,
  getLifecycleLabel,
  type TorrentLifecycle,
} from "@/lib/torrent.utils";

function TorrentRoute() {
  const {
    torrents,
    dlLimit,
    ulLimit,
    torrentFilesMap,
    pauseTorrent,
    resumeTorrent,
    removeTorrent,
    setSpeedLimits,
    updateTorrentOnlyFiles,
    prepareTorrentDownload,
    prepareTorrentDownloadFromFile,
    setFilePriority,
    setSequentialDownload,
    setSeedPreference,
  } = useTorrentStore((state) => state);

  const [dlInput, setDlInput] = useState(
    dlLimit !== null ? String(dlLimit) : "",
  );
  const [ulInput, setUlInput] = useState(
    ulLimit !== null ? String(ulLimit) : "",
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showMagnetModal, setShowMagnetModal] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "progress" | "speed">(
    "name",
  );
  const [sortAsc, setSortAsc] = useState(true);
  const [lifecycleFilter, setLifecycleFilter] = useState<
    TorrentLifecycle | "all"
  >("all");

  const lifecycleTorrents = useMemo(() => {
    if (lifecycleFilter === "all") return torrents;
    return torrents.filter(
      (t) => getTorrentLifecycle(t.state, t.finished) === lifecycleFilter,
    );
  }, [torrents, lifecycleFilter]);

  const filteredTorrents = useMemo(() => {
    let list = filterQuery.trim()
      ? lifecycleTorrents.filter((t) =>
          t.name.toLowerCase().includes(filterQuery.toLowerCase()),
        )
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

  const fetchingRef = useRef<Set<number>>(new Set());
  const prevFinishedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>(
      "tauri://drag-drop",
      (event) => {
        for (const path of event.payload.paths) {
          if (path.toLowerCase().endsWith(".torrent")) {
            prepareTorrentDownloadFromFile(path);
            break;
          }
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const loadMissing = () => {
      const state = useTorrentStore.getState();
      state.torrents.forEach((t) => {
        if (!state.torrentFilesMap[t.id] && !fetchingRef.current.has(t.id)) {
          fetchingRef.current.add(t.id);
          state.loadTorrentFiles(t.id).then((success) => {
            if (!success) {
              setTimeout(() => {
                fetchingRef.current.delete(t.id);
              }, 3000);
            }
          });
        }
      });
    };

    loadMissing();
    const interval = setInterval(loadMissing, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (expanded.size === 0) return;
    const interval = setInterval(() => {
      const state = useTorrentStore.getState();
      state.torrents.forEach((t) => {
        if (expanded.has(t.id) && state.torrentFilesMap[t.id]) {
          state.loadTorrentFiles(t.id);
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expanded]);

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
    const { dlLimit: dl, ulLimit: ul } = useSettingsStore.getState();
    if (dl !== null || ul !== null) {
      setSpeedLimits(dl, ul);
    }
  }, []);

  useEffect(() => {
    const totalDl = torrents.reduce((s, t) => s + t.download_speed, 0);
    const totalUl = torrents.reduce((s, t) => s + t.upload_speed, 0);
    const suffix =
      totalDl > 0 || totalUl > 0
        ? ` ↓${fmtSpeed(totalDl)} ↑${fmtSpeed(totalUl)}`
        : "";
    document.title = `iluhaAnime${suffix}`;

    const settings = useSettingsStore.getState();
    if (!settings.notificationsEnabled) {
      prevFinishedRef.current = new Set(
        torrents.filter((t) => t.finished).map((t) => t.id),
      );
      return;
    }

    const nowFinished = new Set<number>();
    for (const t of torrents) {
      if (t.finished && !prevFinishedRef.current.has(t.id)) {
        nowFinished.add(t.id);
      }
    }
    if (settings.notifyOnComplete) {
      for (const id of nowFinished) {
        const name = torrents.find((t) => t.id === id)?.name ?? "";
        useNotificationStore
          .getState()
          .add("Загрузка завершена", "success", name);
      }
    }
    prevFinishedRef.current = new Set(
      torrents.filter((t) => t.finished).map((t) => t.id),
    );
  }, [torrents]);

  const applySpeedLimits = () => {
    const dl = dlInput === "" ? null : Number(dlInput);
    const ul = ulInput === "" ? null : Number(ulInput);
    if (dl !== null && (isNaN(dl) || dl <= 0)) return;
    if (ul !== null && (isNaN(ul) || ul <= 0)) return;
    setSpeedLimits(dl, ul);
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-auto">
      <SpeedLimitForm
        dlInput={dlInput}
        ulInput={ulInput}
        dlLimit={dlLimit}
        ulLimit={ulLimit}
        onDlChange={setDlInput}
        onUlChange={setUlInput}
        onApply={applySpeedLimits}
      />
      <section className="flex items-center gap-1 p-0.5 windows95-active-border bg-primary">
        {(["all", "staging", "live", "seeding", "completed"] as const).map(
          (lc) => (
            <Button
              key={lc}
              variant={lifecycleFilter === lc ? "outline" : "default"}
              size="default"
              className="px-1 py-0.5 text-[10px]"
              onClick={() => setLifecycleFilter(lc)}
            >
              {lc === "all" ? "Все" : getLifecycleLabel(lc)}
            </Button>
          ),
        )}
      </section>
      <section className="flex items-center gap-2 p-1 windows95-active-border bg-primary">
        <span className="ml-auto" />
        <Input
          className="w-32"
          placeholder="Фильтр..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <select
          className="windows95-border windows95-text bg-white h-6 w-24"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="name">Имя</option>
          <option value="size">Размер</option>
          <option value="progress">Прогресс</option>
          <option value="speed">Скорость</option>
        </select>
        <Button
          size="icon"
          className="size-5"
          onClick={() => setSortAsc((v) => !v)}
          title={sortAsc ? "По возрастанию" : "По убыванию"}
        >
          {sortAsc ? (
            <SortAsc className="size-3" />
          ) : (
            <SortDesc className="size-3" />
          )}
        </Button>
        <Button
          className="flex items-center windows95-text"
          onClick={() => setShowMagnetModal(true)}
        >
          <Plus className="size-4" />
          магнит
        </Button>
      </section>
      {filteredTorrents.map((item) => {
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
            onUpdateFiles={(indices) =>
              updateTorrentOnlyFiles(item.id, indices)
            }
            onFilePriorityChange={(indices, priority) =>
              setFilePriority(item.id, indices, priority as any)
            }
            onSetSequential={(enabled) =>
              setSequentialDownload(item.id, enabled)
            }
            onRetry={async () => {
              await removeTorrent(item.id, false);
              const magnet = `magnet:?xt=urn:btih:${item.info_hash}`;
              prepareTorrentDownload(magnet);
            }}
          />
        );
      })}
      {showMagnetModal && (
        <AddTorrentModal
          open={showMagnetModal}
          onClose={() => setShowMagnetModal(false)}
          onAddMagnet={(magnet) => prepareTorrentDownload(magnet)}
          onAddFile={(path) => prepareTorrentDownloadFromFile(path)}
        />
      )}
    </main>
  );
}

export default TorrentRoute;
