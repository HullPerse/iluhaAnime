import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { listStatusOptions } from "@/config/anilist.config";
import { useI18n } from "@/lib/i18n";
import type { AniMedia } from "@/types/anilist";

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
  const { t } = useI18n();
  const [editStatus, setEditStatus] = useState(
    listEntry?.list_status ?? "PLANNING"
  );
  const [editProgress, setEditProgress] = useState(
    listEntry?.progress?.toString() ?? ""
  );
  const [editScore, setEditScore] = useState(
    listEntry?.score?.toString() ?? ""
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
        progress: editProgress ? Number.parseInt(editProgress, 10) : null,
        score: editScore ? Number.parseFloat(editScore) : null,
      });
      onSaved?.();
      onClose?.();
    } catch {
      setSaveError(t("anilist.controls.saveError"));
      setSaving(false);
    }
  };

  return (
    <div className="windows95-border">
      <div className="bg-secondary windows95-font flex flex-row px-1 py-0.5 text-xs font-bold text-white">
        {listEntry
          ? t("anilist.controls.editList")
          : t("anilist.controls.addToList")}
        <Button
          size="icon"
          className="ml-auto size-4"
          title={t("anilist.controls.openSite")}
          onClick={() => {
            openUrl(`https://anilist.co/anime/${anime.id}`);
          }}
        >
          <ExternalLink className="size-3" />
        </Button>
      </div>
      <div className="flex flex-col gap-2 p-1.5">
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.status")}</span>
          <Select
            className="flex-1"
            value={editStatus}
            onChange={(v) => setEditStatus(v)}
            options={listStatusOptions.map((o) => ({
              ...o,
              label: t(o.label as never),
            }))}
          />
        </div>
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">
            {t("anilist.controls.progress")}
          </span>
          <Input
            type="number"
            min={0}
            max={anime.episodes ?? 9999}
            value={editProgress}
            onChange={(e) => setEditProgress(e.target.value)}
            className="h-7 w-20 text-xs"
          />
          {anime.episodes && (
            <span className="windows95-text text-xs">
              / {anime.episodes} {t("anilist.details.epsShort")}
            </span>
          )}
        </div>
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.score")}</span>
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
          <span className="windows95-text text-xs">/ 10</span>
        </div>
        {saveError && (
          <span className="text-destructive text-xs font-bold">
            {saveError}
          </span>
        )}
        <div className="mt-0.5 flex flex-row justify-end gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("anilist.controls.saving") : t("anilist.controls.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AniListActionControls;
