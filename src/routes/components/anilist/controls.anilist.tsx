import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { Save } from "lucide-react";
import { listStatusOptions } from "@/lib/anilist.utils";
import type { AniMedia } from "@/types/anilist";

function AniListActionControls({
  anime,
  listEntry,
  onSaved,
  onClose,
}: {
  anime: AniMedia;
  listEntry?: { progress: number | null; score: number | null; list_status: string };
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

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await invoke("save_anilist_entry", {
        mediaId: anime.id,
        status: editStatus,
        progress: editProgress ? parseInt(editProgress, 10) : null,
        score: editScore ? parseInt(editScore, 10) : null,
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
      <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
        {listEntry ? "Управление списком" : "Добавить в список"}
      </div>
      <div className="flex flex-col gap-2 p-1.5">
        <div className="flex flex-row gap-2 items-center text-[11px] windows95-text">
          <span className="w-20 shrink-0">Статус:</span>
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            className="flex-1 windows95-border bg-primary text-text windows95-font text-[11px] px-1 py-0.5"
          >
            {listStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-row gap-2 items-center text-[11px] windows95-text">
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
        <div className="flex flex-row gap-2 items-center text-[11px] windows95-text">
          <span className="w-20 shrink-0">Оценка:</span>
          <select
            value={editScore}
            onChange={(e) => setEditScore(e.target.value)}
            className="windows95-border bg-primary text-text windows95-font text-[11px] px-1 py-0.5"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-[10px] windows95-text">/ 10</span>
        </div>
        {saveError && (
          <span className="text-[10px] font-bold text-destructive">
            {saveError}
          </span>
        )}
        <div className="flex flex-row gap-2 justify-end mt-0.5">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-3" />
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AniListActionControls;
