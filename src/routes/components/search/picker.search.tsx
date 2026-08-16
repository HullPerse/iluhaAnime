import { open } from "@tauri-apps/plugin-dialog";
import { useState, useEffect, useRef, useCallback } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import {
  fmtSize,
  fmtElapsed,
  groupFilesByDirectory,
} from "@/lib/torrent.utils";
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
  ) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const { t } = useI18n();
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [browsing, setBrowsing] = useState(false);
  const [sequential, setSequential] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        torrent?.files.filter((f) => f.selected).map((f) => f.index) ?? []
      )
  );
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!torrent) return;
    setSaveDir(defaultSaveDir);
    setSelected(
      new Set(
        torrent.files.filter((file) => file.selected).map((file) => file.index)
      )
    );
    setSequential(false);
    setIsLoading(false);
  }, [torrent, defaultSaveDir]);

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
      title: t("picker.selectFolder"),
    });
    if (dir) setSaveDir(dir);
    setBrowsing(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!torrent) return;
    setIsLoading(true);
    const subFolder = torrent.hasCommonFolder ? undefined : torrent.name;
    try {
      await onConfirm([...selected], saveDir, subFolder, sequential);
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
      header={
        loading
          ? t("picker.loadingMetadata")
          : (torrent?.name ?? t("picker.download"))
      }
      onClose={onCancel}
      className="w-3xl"
    >
      {loading ? (
        <section className="flex flex-col items-center justify-center gap-2 py-4">
          <SmallLoader />
          <span className="windows95-text text-muted">
            {fmtElapsed(elapsed, t)}
          </span>
        </section>
      ) : (
        <section className="flex h-full w-full flex-1 flex-col items-center gap-2 py-4">
          <div className="windows95-border flex h-full w-full overflow-y-auto">
            <label className="windows95-text bg-primary flex cursor-pointer items-center gap-1 px-1 py-0.5 select-none">
              <Checkbox checked={allSelected} onChange={toggleAll} />
              {allSelected ? t("picker.deselectAll") : t("picker.selectAll")}
              <span className="text-muted ml-auto text-[10px]">
                {fmtSize(selectedSize)} / {fmtSize(totalSize)}
                {" · "}
                {t("picker.fileCount", { count: torrent!.files.length })}
              </span>
            </label>
          </div>
          <div className="flex h-42 w-full flex-col overflow-y-auto pr-2">
            {torrent &&
              groupFilesByDirectory(torrent.files).map((group) => (
                <div key={group.dir || "__root__"}>
                  {group.dir && (
                    <div className="windows95-font flex items-center gap-1 px-1 py-0.5 text-[10px] select-none">
                      <ImageComponent
                        src="/images/w2k_folder_closed.ico"
                        alt=""
                        className="size-4 shrink-0"
                      />
                      <span className="truncate font-bold" title={group.dir}>
                        {group.dir}
                      </span>
                      <span className="text-muted ml-auto">
                        {fmtSize(group.files.reduce((s, f) => s + f.size, 0))}
                      </span>
                    </div>
                  )}
                  {group.files.map((item) => {
                    const conflict = torrent!.conflictingFiles.includes(
                      item.name
                    );

                    return (
                      <label
                        key={item.index}
                        className={`windows95-text hover:bg-surface flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 select-none ${group.dir ? "pl-5" : ""} windows95-border`}
                      >
                        <Checkbox
                          checked={selected.has(item.index)}
                          onChange={() => toggleFile(item.index)}
                          className="shrink-0"
                        />
                        <span
                          className="windows95-text flex-1 truncate"
                          title={item.displayName}
                        >
                          {item.displayName}
                        </span>
                        <span className="text-muted shrink-0 text-[10px]">
                          {fmtSize(item.size)}
                        </span>
                        {conflict && (
                          <span className="text-destructive shrink-0 text-[10px]">
                            {t("picker.exists")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}
          </div>

          <div className="flex w-full items-center gap-1">
            <span className="windows95-text shrink-0">
              {t("picker.folder")}
            </span>
            <Input className="flex-1" value={saveDir} readOnly />
            <Button onClick={browseFolder} disabled={browsing || loading}>
              {t("picker.browse")}
            </Button>
          </div>

          <div className="flex w-full items-center justify-between">
            <label className="windows95-text flex cursor-pointer items-center gap-1 select-none">
              <Checkbox
                checked={sequential}
                onChange={(v) => setSequential(v)}
              />
              {t("picker.sequential")}
            </label>
            <div className="flex gap-1">
              <Button onClick={onCancel}>{t("common.cancel")}</Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  isLoading || loading || selected.size === 0 || !saveDir
                }
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
