import { open } from "@tauri-apps/plugin-dialog";
import { useState, useEffect, useRef } from "react";
import { SmallLoader } from "../../components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { fmtSize, groupFilesByDirectory } from "@/lib/torrent.utils";
import { FolderOpen } from "lucide-react";

export interface TorrentFileInfo {
  index: number;
  name: string;
  size: number;
  completed: boolean;
  selected: boolean;
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
  onConfirm: (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean,
  ) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(torrent?.files.map((f) => f.index) ?? []),
  );
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [browsing, setBrowsing] = useState(false);
  const [sequential, setSequential] = useState(false);
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
    const dir = await open({
      directory: true,
      title: "Выберите папку для сохранения",
    });
    if (dir) setSaveDir(dir);
    setBrowsing(false);
  };

  const handleConfirm = () => {
    if (!torrent) return;
    const subFolder = torrent.hasCommonFolder ? undefined : torrent.name;
    onConfirm([...selected], saveDir, subFolder, sequential);
  };

  const allSelected = torrent ? selected.size === torrent.files.length : false;

  return (
    <Modal
      header={loading ? "Загрузка метаданных..." : `${torrent!.name}`}
      onClose={onCancel}
    >
      {loading ? (
        <section className="flex flex-col items-center justify-center gap-2 py-4">
          <SmallLoader />
          <span className="windows95-text text-muted">
            {fmtElapsed(elapsed)}
          </span>
        </section>
      ) : (
        <section className="flex-1  flex flex-col items-center gap-2 py-4 w-full h-full">
          <div className="flex w-full h-full overflow-y-auto windows95-border">
            <label className="flex items-center gap-1 px-1 py-0.5 windows95-text bg-primary cursor-pointer select-none">
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
          </div>
          <div className="flex flex-col h-42 w-full pr-2 overflow-y-auto">
            {torrent && groupFilesByDirectory(torrent.files).map((group) => (
              <div key={group.dir || "__root__"}>
                {group.dir && (
                  <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font bg-[#c0c0c0] windows95-border select-none">
                    <FolderOpen className="size-3 shrink-0" />
                    <span className="font-bold truncate">{group.dir}</span>
                    <span className="text-muted ml-auto">
                      {fmtSize(group.files.reduce((s, f) => s + f.size, 0))}
                    </span>
                  </div>
                )}
                {group.files.map((item) => {
                  const conflict = torrent!.conflictingFiles.includes(item.name);

                  return (
                    <label
                      key={item.index}
                      className={`flex items-center w-full gap-1 px-1 py-0.5 windows95-text select-none hover:bg-[#e0e0e0] cursor-pointer ${group.dir ? "pl-5" : ""} windows95-border`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.index)}
                        onChange={() => toggleFile(item.index)}
                        className="cursor-pointer shrink-0"
                      />
                      <span className="truncate flex-1 text-[11px]">{item.displayName}</span>
                      <span className="text-muted shrink-0 text-[10px]">
                        {fmtSize(item.size)}
                      </span>
                      {conflict && (
                        <span className="text-destructive text-[10px] shrink-0">
                          [существует]
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1 w-full">
            <span className="windows95-text shrink-0">Папка:</span>
            <input
              className="flex-1 h-5 windows95-border px-1 windows95-text outline-none"
              value={saveDir}
              readOnly
            />
            <Button onClick={browseFolder} disabled={browsing || loading}>
              Обзор
            </Button>
          </div>
          <div className="flex items-center justify-between w-full">
            <label className="flex items-center gap-1 windows95-text text-[11px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sequential}
                onChange={(e) => setSequential(e.target.checked)}
                className="cursor-pointer"
              />
              Последовательно
            </label>
            <div className="flex gap-1">
              <Button onClick={onCancel}>Отмена</Button>
              <Button
                onClick={handleConfirm}
                disabled={loading || selected.size === 0 || !saveDir}
              >
                Скачать
              </Button>
            </div>
          </div>
        </section>
      )}
    </Modal>
  );
}

export default TorrentFilePicker;
