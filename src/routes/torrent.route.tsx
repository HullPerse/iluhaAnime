import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { fmtSize, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
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
  Square,
  Circle,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import TorrentFilesSection from "./components/torrent/file.torrent";
import { sendNotification } from "@tauri-apps/plugin-notification";

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

  const filteredTorrents = useMemo(
    () =>
      filterQuery.trim()
        ? torrents.filter((t) =>
            t.name.toLowerCase().includes(filterQuery.toLowerCase()),
          )
        : torrents,
    [torrents, filterQuery],
  );

  const hasLive = torrents.some((t) => t.state === "live");
  const hasPaused = torrents.some((t) => t.state === "paused");

  const fetchedRef = useRef<Set<number>>(new Set());
  const prevFinishedRef = useRef<Set<number>>(new Set());

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
    const totalDl = torrents.reduce((s, t) => s + t.download_speed, 0);
    const totalUl = torrents.reduce((s, t) => s + t.upload_speed, 0);
    const suffix = totalDl > 0 || totalUl > 0 ? ` ↓${fmtSpeed(totalDl)} ↑${fmtSpeed(totalUl)}` : "";
    document.title = `iluhaAnime${suffix}`;

    const nowFinished = new Set<number>();
    for (const t of torrents) {
      if (t.finished && !prevFinishedRef.current.has(t.id)) {
        nowFinished.add(t.id);
      }
    }
    for (const id of nowFinished) {
      sendNotification({ title: "Загрузка завершена", body: torrents.find((t) => t.id === id)?.name ?? "" });
    }
    prevFinishedRef.current = new Set(torrents.filter((t) => t.finished).map((t) => t.id));
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
    <main className="flex flex-col gap-1 h-full w-full overflow-y-scroll">
      <section className="flex items-center gap-2 p-1 windows95-active-border bg-primary">
        <span className="windows95-text">
          <ArrowDown />
        </span>
        <input
          className="w-16 h-5 windows95-border px-1 windows95-text outline-none"
          placeholder="KB/s"
          value={dlInput}
          onChange={(e) => setDlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySpeedLimits()}
          onBlur={applySpeedLimits}
        />
        <span className="windows95-text">
          <ArrowUp />
        </span>
        <input
          className="w-16 h-5 windows95-border px-1 windows95-text outline-none"
          placeholder="KB/s"
          value={ulInput}
          onChange={(e) => setUlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySpeedLimits()}
          onBlur={applySpeedLimits}
        />
        <button
          className="windows95-active-border bg-primary px-1.5 py-0.5 text-[10px] windows95-font windows95-active-border cursor-pointer"
          onClick={applySpeedLimits}
        >
          OK
        </button>
        {(dlLimit !== null || ulLimit !== null) && (
          <button
            className="windows95-active-border bg-primary px-1.5 py-0.5 text-[10px] windows95-font windows95-active-border cursor-pointer"
            onClick={() => {
              setDlInput("");
              setUlInput("");
              setSpeedLimits(null, null);
            }}
          >
            Снять
          </button>
        )}
        <span className="ml-auto" />
        <input
          className="w-24 h-5 windows95-border px-1 windows95-text outline-none text-[10px]"
          placeholder="Фильтр..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <button
          className="flex items-center gap-0.5 windows95-active-border bg-primary px-1.5 py-0.5 text-[10px] windows95-font cursor-pointer"
          onClick={() => {
            torrents.forEach((t) => {
              if (t.state === "live") pauseTorrent(t.id);
            });
          }}
          disabled={!hasLive}
          title="Поставить все на паузу"
        >
          <Square className="size-3" />
        </button>
        <button
          className="flex items-center gap-0.5 windows95-active-border bg-primary px-1.5 py-0.5 text-[10px] windows95-font cursor-pointer"
          onClick={() => {
            torrents.forEach((t) => {
              if (t.state === "paused") resumeTorrent(t.id);
            });
          }}
          disabled={!hasPaused}
          title="Возобновить все"
        >
          <Circle className="size-3" />
        </button>
        <button
          className="flex items-center gap-0.5 windows95-active-border bg-primary px-1.5 py-0.5 text-[10px] windows95-font cursor-pointer"
          onClick={() => setShowMagnetModal(true)}
        >
          <Plus className="size-3" />
          магнит
        </button>
      </section>
      {filteredTorrents.length === 0 ? (
        <section className="flex items-center justify-center flex-1 windows95-text">
          {torrents.length === 0 ? "Нет торрентов" : "Ничего не найдено"}
        </section>
      ) : (
        filteredTorrents.map((item, index) => {
        const progress = item.progress * 100;
        const isPaused = item.state === "paused";
        const isLive = item.state === "live";
        const isExpanded = expanded.has(item.id);
        const files = torrentFilesMap[item.id];

        return (
          <div
            key={index}
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
                  >
                    <FolderOpen />
                  </Button>
                )}
                <button
                  title="Последовательная загрузка"
                  className={`size-6 text-[9px] windows95-font windows95-border cursor-pointer flex items-center justify-center $`}
                  onClick={() =>
                    setSequentialDownload(item.id, !item.sequential_download)
                  }
                >
                  {item.sequential_download && <Check className="size-4" />}
                </button>
                <Button
                  variant="error"
                  title="Удалить торрент"
                  size="icon"
                  className="size-6"
                  onClick={async () => {
                    const deleteFiles = await confirm(
                      "Удалить скачанные файлы вместе с торрентом?",
                      {
                        title: "Удаление торрента",
                        kind: "warning",
                        okLabel: "Удалить с файлами",
                        cancelLabel: "Оставить файлы",
                      },
                    );
                    const files = torrentFilesMap[item.id];
                    if (files) {
                      invoke("delete_thumbnails_for_paths", { paths: files.map((f) => `${item.save_dir}/${f.name}`) }).catch(() => {});
                    }
                    removeTorrent(item.id, deleteFiles);
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
                <button
                  className="flex items-center gap-1 text-[10px] windows95-font cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
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
                </button>
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
              </div>
            )}
          </div>
        );
        })
      )
      }
      {showMagnetModal && (
        <Modal
          header="Добавить магнит"
          onClose={() => {
            setShowMagnetModal(false);
            setMagnetInput("");
          }}
        >
          <div className="flex flex-col gap-2 py-2">
            <span className="windows95-text">Введите magnet-ссылку:</span>
            <input
              className="w-full h-6 windows95-border px-1 windows95-text outline-none bg-white"
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
            <div className="flex justify-end gap-1 mt-1">
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
    </main>
  );
}

export default TorrentRoute;
