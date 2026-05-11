import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { fmtBytes, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
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
} from "lucide-react";
import { useState, useEffect } from "react";
import TorrentFilesSection from "./components/file.torrent";

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

  useEffect(() => {
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id]) {
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

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
        <button
          className="flex items-center gap-0.5 windows95-active-border bg-primary px-1.5 py-0.5 text-[10px] windows95-font cursor-pointer"
          onClick={() => setShowMagnetModal(true)}
        >
          <Plus className="size-3" />
          магнит
        </button>
      </section>
      {torrents.map((item, index) => {
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
                  disabled={!isLive || item.finished}
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
                  <span className="text-[11px] text-muted windows95-font">
                    {!item.finished ? stateLabel(item.state) : "Завершено"}
                  </span>
                  <span className="text-[10px] windows95-font">
                    {item.total_bytes > 0
                      ? `${fmtBytes(item.progress_bytes)} / ${fmtBytes(item.total_bytes)} (${progress.toFixed(1)}%)`
                      : fmtBytes(item.progress_bytes)}
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
                            ↑ {fmtBytes(item.uploaded_bytes)}
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
                  Файлы ({files.length})
                </button>
                {isExpanded && (
                  <TorrentFilesSection
                    id={item.id}
                    files={files}
                    type={"torrent"}
                    onToggle={(id, indices) =>
                      updateTorrentOnlyFiles(id, indices)
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
      })}
      {showMagnetModal && (
        <Modal
          header="Добавить магнит"
          onClose={() => {
            setShowMagnetModal(false);
            setMagnetInput("");
          }}
        >
          <div className="flex flex-col gap-2 py-2">
            <span className="windows95-text text-[11px]">
              Введите magnet-ссылку:
            </span>
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
