import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { fmtBytes, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore, type TorrentFileInfo } from "@/store/download.store";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Pause,
  Play,
  Trash,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function TorrentFilesSection({
  id,
  files,
  onToggle,
}: {
  id: number;
  files: TorrentFileInfo[];
  onToggle: (id: number, indices: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(files.map((f) => f.index)),
  );

  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
    onToggle(id, [...next]);
  };

  return (
    <div className="border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white max-h-40 overflow-y-auto">
      {files.map((file) => (
        <label
          key={file.index}
          className="flex items-center gap-1 px-1 py-0.5 text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] cursor-pointer select-none hover:bg-[#e0e0e0]"
        >
          <input
            type="checkbox"
            checked={selected.has(file.index)}
            onChange={() => toggle(file.index)}
            className="cursor-pointer size-3"
          />
          <span className="truncate flex-1">{file.name}</span>
          <span className="text-muted shrink-0">{fmtSize(file.size)}</span>
        </label>
      ))}
    </div>
  );
}

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
  } = useTorrentStore((state) => state);
  const [dlInput, setDlInput] = useState(
    dlLimit !== null ? String(dlLimit) : "",
  );
  const [ulInput, setUlInput] = useState(
    ulLimit !== null ? String(ulLimit) : "",
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
      <section className="flex items-center gap-2 p-1 border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0]">
        <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
          ⬇
        </span>
        <input
          className="w-16 h-5 border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white px-1 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] outline-none"
          placeholder="KB/s"
          value={dlInput}
          onChange={(e) => setDlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySpeedLimits()}
          onBlur={applySpeedLimits}
        />
        <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
          ⬆
        </span>
        <input
          className="w-16 h-5 border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white px-1 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] outline-none"
          placeholder="KB/s"
          value={ulInput}
          onChange={(e) => setUlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySpeedLimits()}
          onBlur={applySpeedLimits}
        />
        <button
          className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-1.5 py-0.5 text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
          onClick={applySpeedLimits}
        >
          OK
        </button>
        {(dlLimit !== null || ulLimit !== null) && (
          <button
            className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-1.5 py-0.5 text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
            onClick={() => {
              setDlInput("");
              setUlInput("");
              setSpeedLimits(null, null);
            }}
          >
            Снять
          </button>
        )}
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
            className="flex flex-col p-2 border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] gap-2"
          >
            {/*title and buttons*/}
            <section className="flex flex-row items-center justify-between">
              <h3 className="line-clamp-1 text-xs font-bold leading-tight font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
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
                  <span className="text-[11px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                    {!item.finished ? stateLabel(item.state) : "Завершено"}
                  </span>
                  <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                    {item.total_bytes > 0
                      ? `${fmtBytes(item.progress_bytes)} / ${fmtBytes(item.total_bytes)} (${progress.toFixed(1)}%)`
                      : fmtBytes(item.progress_bytes)}
                  </span>
                  <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-muted">
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
                          <span className="text-[10px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                            ↑ {fmtSpeed(item.upload_speed)}
                          </span>
                        )}
                        {item.uploaded_bytes > 0 && (
                          <span className="text-[10px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                            ↑ {fmtBytes(item.uploaded_bytes)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
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
                  className="flex items-center gap-1 text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] cursor-pointer hover:bg-[#d0d0d0] px-0.5 py-0.5 w-full text-left"
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
                <span className="text-[10px] text-destructive font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                  {item.error}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}

export default TorrentRoute;
