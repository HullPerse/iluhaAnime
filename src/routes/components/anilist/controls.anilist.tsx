import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import ImageComponent from "@/components/ui/image.component";
import { listStatusOptions } from "@/lib/anilist.utils";
import type { AniMedia } from "@/types/anilist";
import { openUrl } from "@tauri-apps/plugin-opener";

function AniListActionControls({
  anime,
  listEntry,
  onSaved,
  onClose,
}: {
  anime: AniMedia;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const [editStatus, setEditStatus] = useState(
    listEntry?.list_status ?? "PLANNING",
  );
  const [editProgress, setEditProgress] = useState(
    listEntry?.progress?.toString() ?? "",
  );
  const [editScore, setEditScore] = useState(
    listEntry?.score?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (listEntry) {
      setEditStatus(listEntry.list_status ?? "PLANNING");
      setEditProgress(listEntry.progress?.toString() ?? "");
      setEditScore(listEntry.score?.toString() ?? "");
    }
  }, [listEntry]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await invoke("save_anilist_entry", {
        mediaId: anime.id,
        status: editStatus,
        progress: editProgress ? parseInt(editProgress, 10) : null,
        score: editScore ? parseFloat(editScore) : null,
      });
      onSaved?.();
      onClose?.();
    } catch {
      setSaveError("Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <div className="windows95-border">
      <div className="flex flex-row bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
        {listEntry ? "Управление списком" : "Добавить в список"}
        <Button
          size="icon"
          className="ml-auto size-4"
          title="Открыть на сайте"
          onClick={() => {
            openUrl(`https://anilist.co/anime/${anime.id}`);
          }}
        >
           <ImageComponent src="/icons/w2k_globe.ico" alt="" className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-2 p-1.5">
        <div className="flex flex-row gap-2 items-center windows95-text">
          <span className="w-20 shrink-0">Статус:</span>
          <Select
            className="flex-1"
            value={editStatus}
            onChange={(v) => setEditStatus(v)}
            options={listStatusOptions}
          />
        </div>
        <div className="flex flex-row gap-2 items-center windows95-text">
          <span className="w-20 shrink-0">Прогресс:</span>
          <Input
            type="number"
            min={0}
            max={anime.episodes ?? 9999}
            value={editProgress}
            onChange={(e) => setEditProgress(e.target.value)}
            className="w-20 h-7 text-[11px]"
          />
          {anime.episodes && (
            <span className="text-[10px] windows95-text">
              / {anime.episodes} эп.
            </span>
          )}
        </div>
        <div className="flex flex-row gap-2 items-center windows95-text">
          <span className="w-20 shrink-0">Оценка:</span>
          <Select
            value={editScore}
            onChange={(v) => setEditScore(v)}
            options={[
              { value: "", label: "-" },
              ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                value: String(n),
                label: String(n),
              })),
            ]}
          />
          <span className="text-[10px] windows95-text">/ 10</span>
        </div>
        {saveError && (
          <span className="text-[10px] font-bold text-destructive">
            {saveError}
          </span>
        )}
        <div className="flex flex-row gap-2 justify-end mt-0.5">
          <Button onClick={handleSave} disabled={saving}>
            <ImageComponent src="/icons/w2k_floppy.ico" alt="" className="size-4" />
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AniListActionControls;
