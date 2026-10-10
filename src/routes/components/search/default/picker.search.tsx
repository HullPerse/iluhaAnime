import { open } from "@tauri-apps/plugin-dialog";
import { useState, useEffect, useRef, useCallback } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { PICKER_ELAPSED_TICK_MS } from "@/config/torrent/common.config";
import { useI18n } from "@/hooks/i18n.hook";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { useCell } from "@/lib/state/signal.hook";
import { torrentFileIcon } from "@/lib/torrent/fileIcon.utils";
import { groupFilesByDirectory } from "@/lib/torrent/tree.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { showError } from "@/lib/utils/notification.utils";
import { formatElapsed } from "@/lib/utils/time.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { PickerTorrent } from "@/types/torrent";

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
    sequential?: boolean
  ) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}) {
  const { t } = useI18n();
  const parseTitlesSearch = useCell(settingsAtoms.parseTitlesSearch);
  const fileOrder = useCell(settingsAtoms.fileOrder);
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [browsing, setBrowsing] = useState(false);
  const [sequential, setSequential] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(torrent?.files.filter((f) => f.selected).map((f) => f.index) ?? [])
  );
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!torrent) return;
    setSaveDir(defaultSaveDir);
    setSelected(new Set(torrent.files.filter((file) => file.selected).map((file) => file.index)));
    setSequential(false);
    setIsLoading(false);
  }, [torrent, defaultSaveDir]);

  useEffect(() => {
    if (loading) {
      startRef.current = Date.now();
      setElapsed(0);
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current!) / 1000));
      }, PICKER_ELAPSED_TICK_MS);
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

  const toggleFolder = useCallback((indices: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (indices.every((index) => next.has(index))) {
        for (const index of indices) next.delete(index);
      } else {
        for (const index of indices) next.add(index);
      }
      return next;
    });
  }, []);

  const browseFolder = useCallback(async () => {
    setBrowsing(true);
    const dir = await open({
      directory: true,
      title: t("picker.select.folder"),
    });
    if (dir) setSaveDir(dir);
    setBrowsing(false);
  }, [t]);

  const handleConfirm = useCallback(async () => {
    if (!torrent) return;
    setIsLoading(true);
    const subFolder = torrent.hasCommonFolder ? undefined : torrent.name;
    const [, error] = await attempt(onConfirm([...selected], saveDir, subFolder, sequential));
    if (error) showError(t("common.error"), error.message);
    setIsLoading(false);
  }, [torrent, selected, saveDir, sequential, onConfirm, t]);

  const allSelected = torrent ? selected.size === torrent.files.length : false;

  const selectedSize = torrent
    ? torrent.files.filter((f) => selected.has(f.index)).reduce((s, f) => s + f.size, 0)
    : 0;
  const totalSize = torrent ? torrent.files.reduce((s, f) => s + f.size, 0) : 0;

  return (
    <Modal
      header={loading ? t("picker.loading.metadata") : (torrent?.name ?? t("picker.download"))}
      onClose={onCancel}
      className="w-3xl"
    >
      {torrent?.seeders != null && !loading ? (
        <div className="windows95-text flex items-center gap-1 px-1 text-xs">
          <span className="text-success font-bold">S:{torrent.seeders}</span>
        </div>
      ) : null}
      {loading ? (
        <section className="flex flex-col items-center justify-center gap-2 py-4">
          <SmallLoader />
          <span className="windows95-text text-hint">{formatElapsed(elapsed, t)}</span>
        </section>
      ) : (
        <section className="flex h-full w-full flex-1 flex-col items-center gap-2 py-4">
          <div className="windows95-border flex h-64 w-full flex-col">
            <label className="windows95-text bg-primary border-b-muted flex cursor-pointer items-center gap-1 border-b px-1 py-0.5 select-none">
              <Checkbox
                checked={allSelected}
                onChange={toggleAll}
                aria-label={allSelected ? t("picker.deselect.all") : t("picker.select.all")}
              />
              {allSelected ? t("picker.deselect.all") : t("picker.select.all")}
              <span className="text-hint ml-auto text-xs tabular-nums">
                {t("picker.file.count", { count: selected.size })} /{" "}
                {t("picker.file.count", { count: torrent!.files.length })}
                {" - "}
                {formatBytes(selectedSize)} / {formatBytes(totalSize)}
              </span>
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {torrent &&
                groupFilesByDirectory(torrent.files, fileOrder).map((group) => {
                  const indices = group.files.map((file) => file.index);
                  const folderOn = indices.every((index) => selected.has(index));
                  return (
                    <div key={group.dir || "__root__"}>
                      {group.dir && (
                        <button
                          type="button"
                          onClick={() => toggleFolder(indices)}
                          aria-pressed={folderOn}
                          title={group.dir}
                          className="windows95-font hover:bg-surface flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 text-left text-xs select-none"
                        >
                          <ImageComponent
                            src="/images/w2k_folder_closed.ico"
                            alt=""
                            className="size-4 shrink-0"
                          />
                          <span className="truncate font-bold">{group.dir}</span>
                          <span className="text-hint ml-auto tabular-nums">
                            {formatBytes(group.files.reduce((s, f) => s + f.size, 0))}
                          </span>
                        </button>
                      )}
                      {group.files.map((item) => {
                        const conflict = torrent!.conflictingFiles.includes(item.name);
                        const picked = selected.has(item.index);
                        return (
                          <label
                            key={item.index}
                            aria-selected={picked}
                            className="windows95-text hover:bg-surface windows95-border flex w-full cursor-pointer items-center gap-1 border-t px-1 py-0.5 select-none odd:bg-black/5"
                          >
                            <Checkbox
                              checked={picked}
                              onChange={() => toggleFile(item.index)}
                              className="shrink-0"
                              aria-label={item.displayName}
                            />
                            <ImageComponent
                              src={`/images/${torrentFileIcon(item.name)}`}
                              alt=""
                              className="size-4 shrink-0"
                            />
                            <span
                              className="windows95-text flex-1 truncate text-xs"
                              title={item.displayName}
                            >
                              {parseTitlesSearch
                                ? formatParsedTitle(item.displayName, t)
                                : item.displayName}
                            </span>
                            <span className="text-hint shrink-0 text-xs tabular-nums">
                              {formatBytes(item.size)}
                            </span>
                            {conflict && (
                              <span className="text-destructive shrink-0 text-xs">
                                {t("picker.exists")}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="flex w-full items-center gap-1">
            <span className="windows95-text shrink-0">{t("picker.folder")}</span>
            <Input className="flex-1" value={saveDir} readOnly />
            <Button onClick={browseFolder} disabled={browsing || loading}>
              {t("picker.browse")}
            </Button>
          </div>

          <div className="flex w-full items-center justify-between">
            <label className="windows95-text flex cursor-pointer items-center gap-1 select-none">
              <Checkbox checked={sequential} onChange={(v) => setSequential(v)} />
              {t("picker.sequential")}
            </label>
            <div className="flex gap-1">
              <Button onClick={onCancel}>{t("common.cancel")}</Button>
              <Button
                onClick={handleConfirm}
                disabled={isLoading || loading || selected.size === 0 || !saveDir}
              >
                {isLoading ? <SmallLoader /> : t("picker.download")}
              </Button>
            </div>
          </div>
        </section>
      )}
    </Modal>
  );
}

export default TorrentFilePicker;
