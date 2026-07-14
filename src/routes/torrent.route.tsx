import { Input } from "@/components/ui/input.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { fmtSize, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import { openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import Modal from "@/components/shared/modal.component";
import {
  Pause,
  Play,
  Trash,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Plus,
  Check,
  File,
  SortAsc,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import TorrentFilesSection from "./components/torrent/file.torrent";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useSettingsStore } from "@/store/settings.store";

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
    loadTorrentFiles,
    updateTorrentOnlyFiles,
    prepareTorrentDownload,
    prepareTorrentDownloadFromFile,
    setFilePriority,
    setSequentialDownload,
  } = useTorrentStore((state) => state);

  const [dlInput, setDlInput] = useState(
    dlLimit !== null ? String(dlLimit) : "",
  );
  const [ulInput, setUlInput] = useState(
    ulLimit !== null ? String(ulLimit) : "",
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showMagnetModal, setShowMagnetModal] = useState(false);
  const [magnetInput, setMagnetInput] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "progress" | "speed">(
    "name",
  );
  const [sortAsc, setSortAsc] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    files: string[];
    saveDir: string;
  } | null>(null);

  const filteredTorrents = useMemo(() => {
    let list = filterQuery.trim()
      ? torrents.filter((t) =>
          t.name.toLowerCase().includes(filterQuery.toLowerCase()),
        )
      : torrents;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = a.total_bytes - b.total_bytes;
      else if (sortBy === "progress") cmp = a.progress - b.progress;
      else if (sortBy === "speed") cmp = a.download_speed - b.download_speed;
      return sortAsc ? cmp : -cmp;
    });
  }, [torrents, filterQuery, sortBy, sortAsc]);

  const fetchedRef = useRef<Set<number>>(new Set());
  const prevFinishedRef = useRef<Set<number>>(new Set());

  // Drag and drop support
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
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id] && !fetchedRef.current.has(t.id)) {
        fetchedRef.current.add(t.id);
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

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
        sendNotification({
          title: "Загрузка завершена",
          body: torrents.find((t) => t.id === id)?.name ?? "",
        });
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

  const effective = (input: string) => (input === "" ? null : Number(input));

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-auto">
      <section className="flex items-center gap-2 p-1 windows95-active-border bg-primary">
        <span className="windows95-text">
          <ArrowDown />
        </span>
        <Input
          type="number"
          className="w-16"
          placeholder="KB/s"
          value={dlInput}
          onChange={(e) => {
            if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
              setDlInput(e.target.value);
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && applySpeedLimits()}
          onBlur={applySpeedLimits}
        />
        <span className="windows95-text">
          <ArrowUp />
        </span>
        <Input
          type="number"
          className="w-16"
          placeholder="KB/s"
          value={ulInput}
          onChange={(e) => {
            if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
              setUlInput(e.target.value);
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && applySpeedLimits()}
          onBlur={applySpeedLimits}
        />
        <Button
          size="icon"
          className="windows95-text size-6"
          onClick={applySpeedLimits}
          disabled={
            effective(dlInput) === dlLimit && effective(ulInput) === ulLimit
          }
        >
          <Check className="size-4" />
        </Button>
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
          <SortAsc
            className={`size-3 transition ${sortAsc ? "" : "rotate-180"}`}
          />
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
        const progress = item.progress * 100;
        const isPaused = item.state === "paused";
        const isLive = item.state === "live";
        const isExpanded = expanded.has(item.id);
        const files = torrentFilesMap[item.id];

        return (
          <div
            key={item.id}
            className="flex flex-col p-2 windows95-active-border bg-primary gap-2"
          >
            {/*title and buttons*/}
            <section className="flex flex-row items-center justify-between">
              <h3 className="line-clamp-1 text-xs font-bold leading-tight windows95-font">
                {item.name}
              </h3>
              <div className="flex flex-row items-center gap-1">
                <Button
                  title="Поставить на паузу"
                  rendered={isLive}
                  size="icon"
                  className="size-6"
                  onClick={() => pauseTorrent(item.id)}
                  disabled={!isLive || item.finished}
                >
                  <Pause />
                </Button>
                <Button
                  title="Продолжить скачивание"
                  rendered={isPaused}
                  size="icon"
                  className="size-6"
                  onClick={() => resumeTorrent(item.id)}
                  disabled={!isPaused || item.finished}
                >
                  <Play />
                </Button>
                {item.save_dir && (
                  <Button
                    title="Открыть в папке"
                    size="icon"
                    className="size-6"
                    onClick={() => openPath(item.save_dir)}
                    disabled={!item.save_dir}
                  >
                    <FolderOpen />
                  </Button>
                )}
                <Button
                  title="Последовательная загрузка"
                  className="size-6 text-[9px] windows95-font flex items-center justify-center"
                  variant={item.sequential_download ? "default" : "outline"}
                  onClick={() =>
                    setSequentialDownload(item.id, !item.sequential_download)
                  }
                >
                  {item.sequential_download && <Check className="size-4" />}
                </Button>

                <Button
                  variant="error"
                  title="Удалить торрент"
                  size="icon"
                  className="size-6"
                  onClick={() => {
                    setPendingDelete({
                      id: item.id,
                      files:
                        torrentFilesMap[item.id]?.map(
                          (f) => `${item.save_dir}/${f.name}`,
                        ) ?? [],
                      saveDir: item.save_dir ?? "",
                    });
                  }}
                  disabled={!item}
                >
                  <Trash />
                </Button>
              </div>
            </section>
            {/*progress bar and status inside progress bar*/}
            <section className="flex flex-row items-start justify-between gap-1 w-full">
              <div className="flex w-full flex-col">
                <ProgressBar
                  value={item.progress_bytes}
                  max={item.total_bytes}
                />
                <div className="flex items-center gap-1">
                  <span className="windows95-text text-muted">
                    {!item.finished ? stateLabel(item.state) : "Завершено"}
                  </span>
                  <span className="text-[10px] windows95-font">
                    {item.total_bytes > 0
                      ? `${fmtSize(item.progress_bytes)} / ${fmtSize(item.total_bytes)} (${progress.toFixed(1)}%)`
                      : fmtSize(item.progress_bytes)}
                  </span>
                  <span className="text-[10px] windows95-font text-muted">
                    {fmtSpeed(item.download_speed)}
                    {fmtSpeed(item.download_speed) &&
                      fmtETA(item.eta_secs) &&
                      " · "}
                    {fmtETA(item.eta_secs)}
                  </span>
                  <span className="flex flex-row ml-auto">
                    {(item.upload_speed > 0 ||
                      item.uploaded_bytes > 0 ||
                      item.peers_connected > 0) && (
                      <div className="flex items-center gap-1">
                        {item.upload_speed > 0 && (
                          <span className="text-[10px] text-muted windows95-font">
                            ↑ {fmtSpeed(item.upload_speed)}
                          </span>
                        )}
                        {item.uploaded_bytes > 0 && (
                          <span className="text-[10px] text-muted windows95-font">
                            ↑ {fmtSize(item.uploaded_bytes)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted windows95-font">
                          P: {item.peers_connected}
                        </span>
                      </div>
                    )}
                  </span>
                </div>
              </div>
            </section>
            {/*files toggle*/}
            {files && (
              <section>
                <div
                  role="button"
                  className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
                  onClick={() => toggleExpanded(item.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  {`Файлы (${files.filter((f) => f.completed).length} / ${files.length})`}
                  {files.some((f) => !f.exists) && (
                    <span className="text-destructive ml-1">
                      · {files.filter((f) => !f.exists).length} отсутствуют
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <TorrentFilesSection
                    id={item.id}
                    files={files}
                    type={"torrent"}
                    onToggle={(id, indices) =>
                      updateTorrentOnlyFiles(id, indices)
                    }
                    onFilePriorityChange={(id, indices, priority) =>
                      setFilePriority(id, indices, priority)
                    }
                  />
                )}
              </section>
            )}
            {/*info*/}
            {item.error && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[10px] text-destructive windows95-font">
                  {item.error}
                </span>
                <Button
                  size="icon"
                  className="size-4 ml-auto"
                  title="Повторить"
                  onClick={async () => {
                    await removeTorrent(item.id, false);
                    const magnet = `magnet:?xt=urn:btih:${item.info_hash}`;
                    prepareTorrentDownload(magnet);
                  }}
                >
                  <RefreshCw className="size-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {showMagnetModal && (
        <Modal
          header="Добавить торрент"
          onClose={() => {
            setShowMagnetModal(false);
            setMagnetInput("");
          }}
          className="w-xl"
        >
          <div className="flex flex-col gap-2 py-2">
            <span className="windows95-text">Magnet-ссылка:</span>
            <Input
              className="w-full"
              placeholder="magnet:?xt=urn:btih:..."
              value={magnetInput}
              onChange={(e) => setMagnetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && magnetInput.trim()) {
                  setShowMagnetModal(false);
                  setMagnetInput("");
                  prepareTorrentDownload(magnetInput.trim());
                }
              }}
              autoFocus
            />
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] windows95-text text-muted">или</span>
              <Button
                onClick={async () => {
                  const file = await openDialog({
                    multiple: false,
                    filters: [
                      {
                        name: "Torrent",
                        extensions: ["torrent"],
                      },
                    ],
                  });
                  if (file) {
                    setShowMagnetModal(false);
                    setMagnetInput("");
                    prepareTorrentDownloadFromFile(file);
                  }
                }}
              >
                <File className="size-4" />
                Выбрать .torrent
              </Button>
            </div>
            <div className="flex justify-end gap-1 mt-2">
              <Button
                onClick={() => {
                  setShowMagnetModal(false);
                  setMagnetInput("");
                }}
              >
                Отмена
              </Button>
              <Button
                onClick={() => {
                  if (magnetInput.trim()) {
                    setShowMagnetModal(false);
                    setMagnetInput("");
                    prepareTorrentDownload(magnetInput.trim());
                  }
                }}
                disabled={!magnetInput.trim()}
              >
                Продолжить
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {pendingDelete && (
        <ConfirmDialog
          open
          title="Удаление торрента"
          message="Удалить скачанные файлы вместе с торрентом?"
          confirmLabel="Удалить с файлами"
          cancelLabel="Оставить файлы"
          variant="destructive"
          onConfirm={() => {
            removeTorrent(pendingDelete.id, true);
            setPendingDelete(null);
          }}
          onCancel={() => {
            removeTorrent(pendingDelete.id, false);
            setPendingDelete(null);
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </main>
  );
}

export default TorrentRoute;
