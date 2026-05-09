import { open } from "@tauri-apps/plugin-dialog";
import { useState, useEffect, useRef } from "react";
import { SmallLoader } from "./loader.component";

export interface TorrentFileInfo {
  index: number;
  name: string;
  size: number;
}

export interface PickerTorrent {
  magnet: string;
  id: number;
  name: string;
  files: TorrentFileInfo[];
  conflictingFiles: string[];
  hasCommonFolder: boolean;
}

function TorrentFilePicker({
  torrent,
  defaultSaveDir,
  onConfirm,
  onCancel,
  loading = false,
}: {
  torrent: PickerTorrent | null;
  defaultSaveDir: string;
  onConfirm: (selectedIndices: number[], saveDir: string, subFolder: string | undefined) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(torrent?.files.map((f) => f.index) ?? []),
  );
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [browsing, setBrowsing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      startRef.current = Date.now();
      setElapsed(0);
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current!) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      startRef.current = null;
      setElapsed(0);
    }
  }, [loading]);

  const fmtElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s} сек`;
    if (s === 0) return `${m} мин`;
    return `${m} мин ${s} сек`;
  };

  const toggleFile = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (!torrent) return;
    if (selected.size === torrent.files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(torrent.files.map((f) => f.index)));
    }
  };

  const browseFolder = async () => {
    setBrowsing(true);
    const dir = await open({ directory: true, title: "Выберите папку для сохранения" });
    if (dir) setSaveDir(dir);
    setBrowsing(false);
  };

  const handleConfirm = () => {
    if (!torrent) return;
    const subFolder =
      !torrent.hasCommonFolder && torrent.files.length > 1
        ? torrent.name
        : undefined;
    onConfirm([...selected], saveDir, subFolder);
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const allSelected = torrent ? selected.size === torrent.files.length : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex flex-col w-[520px] max-h-[80vh] border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] shadow-lg">
        <div className="flex items-center justify-between px-1 py-0.5 bg-[#000080]">
          <span className="text-white text-[11px] font-bold font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
            {loading ? "Получение информации о торренте..." : `Выбор файлов — ${torrent!.name}`}
          </span>
          <button
            className="size-4 flex items-center justify-center bg-[#c0c0c0] border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted text-[10px] leading-none font-bold active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
            onClick={onCancel}
          >
            X
          </button>
        </div>

        <div className="flex flex-col gap-1 p-2 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <SmallLoader />
              <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-muted">
                {fmtElapsed(elapsed)}
              </span>
            </div>
          ) : (<>
          <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
            Выберите файлы для скачивания:
          </span>

          <div className="flex-1 overflow-y-auto border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white">
            <label className="flex items-center gap-1 px-1 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] bg-[#c0c0c0] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="cursor-pointer"
              />
              {allSelected ? "Снять все" : "Выбрать все"}
              <span className="ml-auto text-muted">
                {torrent!.files.length} файлов
              </span>
            </label>

            {torrent!.files.map((file) => {
              const conflict = torrent!.conflictingFiles.includes(file.name);
              return (
                <label
                  key={file.index}
                  className="flex items-center gap-1 px-1 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] cursor-pointer select-none hover:bg-[#e0e0e0]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(file.index)}
                    onChange={() => toggleFile(file.index)}
                    className="cursor-pointer"
                  />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-muted shrink-0">{fmtSize(file.size)}</span>
                  {conflict && (
                    <span className="text-destructive text-[10px] shrink-0">[существует]</span>
                  )}
                </label>
              );
            })}
          </div>
          </>)}

          <div className="flex items-center gap-1">
            <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] shrink-0">
              Папка:
            </span>
            <input
              className="flex-1 h-5 border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white px-1 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] outline-none"
              value={saveDir}
              readOnly
            />
            <button
              className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-2 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer disabled:opacity-50"
              onClick={browseFolder}
              disabled={browsing || loading}
            >
              Обзор
            </button>
          </div>

          <div className="flex justify-end gap-1">
            <button
              className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-3 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
              onClick={onCancel}
            >
              Отмена
            </button>
            <button
              className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-3 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer disabled:opacity-50"
              onClick={handleConfirm}
              disabled={loading || selected.size === 0 || !saveDir}
            >
              Скачать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TorrentFilePicker;
