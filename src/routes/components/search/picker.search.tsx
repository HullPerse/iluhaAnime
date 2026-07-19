import { Input } from "@/components/ui/input.component";
import { open } from "@tauri-apps/plugin-dialog";
import { useState, useEffect, useRef, useCallback } from "react";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import {
  fmtSize,
  fmtElapsed,
  groupFilesByDirectory,
} from "@/lib/torrent.utils";
import ImageComponent from "@/components/ui/image.component";
import { PickerTorrent } from "@/types/torrent";

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
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [browsing, setBrowsing] = useState(false);
  const [sequential, setSequential] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        torrent?.files.filter((f) => f.selected).map((f) => f.index) ?? [],
      ),
  );
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
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

  const toggleFile = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!torrent) return;
    setSelected((prev) => {
      if (prev.size === torrent.files.length) {
        return new Set();
      }
      return new Set(torrent.files.map((f) => f.index));
    });
  }, [torrent]);

  const browseFolder = useCallback(async () => {
    setBrowsing(true);
    const dir = await open({
      directory: true,
      title: "Выберите папку для сохранения",
    });
    if (dir) setSaveDir(dir);
    setBrowsing(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!torrent) return;
    setIsLoading(true);
    const subFolder = torrent.hasCommonFolder ? undefined : torrent.name;
    try {
      onConfirm([...selected], saveDir, subFolder, sequential);
    } finally {
      setIsLoading(false);
    }
  }, [torrent, selected, saveDir, sequential, onConfirm]);

  const allSelected = torrent ? selected.size === torrent.files.length : false;

  const selectedSize = torrent
    ? torrent.files
        .filter((f) => selected.has(f.index))
        .reduce((s, f) => s + f.size, 0)
    : 0;
  const totalSize = torrent ? torrent.files.reduce((s, f) => s + f.size, 0) : 0;

  return (
    <Modal
      header={loading ? "Загрузка метаданных..." : `${torrent!.name}`}
      onClose={onCancel}
      className="w-3xl"
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
              <Checkbox checked={allSelected} onChange={toggleAll} />
              {allSelected ? "Снять все" : "Выбрать все"}
              <span className="ml-auto text-muted text-[10px]">
                {fmtSize(selectedSize)} / {fmtSize(totalSize)}
                {" · "}
                {torrent!.files.length} файлов
              </span>
            </label>
          </div>
          <div className="flex flex-col h-42 w-full pr-2 overflow-y-auto">
            {torrent &&
              groupFilesByDirectory(torrent.files).map((group) => (
                <div key={group.dir || "__root__"}>
                  {group.dir && (
                    <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font select-none">
                      <ImageComponent
                        src="/images/w2k_folder_closed.ico"
                        alt=""
                        className="size-4 shrink-0"
                      />
                      <span className="font-bold truncate" title={group.dir}>
                        {group.dir}
                      </span>
                      <span className="text-muted ml-auto">
                        {fmtSize(group.files.reduce((s, f) => s + f.size, 0))}
                      </span>
                    </div>
                  )}
                  {group.files.map((item) => {
                    const conflict = torrent!.conflictingFiles.includes(
                      item.name,
                    );

                    return (
                      <label
                        key={item.index}
                        className={`flex items-center w-full gap-1 px-1 py-0.5 windows95-text select-none hover:bg-surface cursor-pointer ${group.dir ? "pl-5" : ""} windows95-border`}
                      >
                        <Checkbox
                          checked={selected.has(item.index)}
                          onChange={() => toggleFile(item.index)}
                          className="shrink-0"
                        />
                        <span
                          className="truncate flex-1 windows95-text"
                          title={item.displayName}
                        >
                          {item.displayName}
                        </span>
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
            <Input className="flex-1" value={saveDir} readOnly />
            <Button onClick={browseFolder} disabled={browsing || loading}>
              Обзор
            </Button>
          </div>

          <div className="flex items-center justify-between w-full">
            <label className="flex items-center gap-1 windows95-text cursor-pointer select-none">
              <Checkbox
                checked={sequential}
                onChange={(v) => setSequential(v)}
              />
              Последовательно
            </label>
            <div className="flex gap-1">
              <Button onClick={onCancel}>Отмена</Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  isLoading || loading || selected.size === 0 || !saveDir
                }
              >
                {isLoading ? <SmallLoader /> : "Скачать"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </Modal>
  );
}

export default TorrentFilePicker;
