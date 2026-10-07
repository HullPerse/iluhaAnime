import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { EntryListInfo } from "@/lib/anilist/entries.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { addNotification } from "@/store/notification.store";
import type { AnilistRouteData, AniMedia } from "@/types/anilist";

function patchProgress(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number,
  progress: number
): void {
  queryClient.setQueryData(["anilist_data"], (old: unknown) => {
    if (!old) return old;
    const data = old as AnilistRouteData;
    return {
      ...data,
      lists: data.lists.map((list) => ({
        ...list,
        entries: list.entries.map((item) =>
          item.media.id === mediaId ? { ...item, progress } : item
        ),
      })),
    };
  });
}

export function ProgressStepper({
  media,
  entry,
}: {
  media: Pick<AniMedia, "id" | "episodes">;
  entry: EntryListInfo;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const progress = entry.progress ?? 0;
  const max = media.episodes;
  const atMin = progress <= 0;
  const atMax = max != null && progress >= max;

  const step = async (delta: 1 | -1) => {
    if (saving) return;
    const next =
      max != null ? Math.min(max, Math.max(0, progress + delta)) : Math.max(0, progress + delta);
    if (next === progress) return;
    setSaving(true);
    const previous = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
    patchProgress(queryClient, media.id, next);
    const [, error] = await attempt(
      anilistApi.saveEntry({
        mediaId: media.id,
        status: entry.list_status,
        progress: next,
        score: entry.score,
        notes: entry.notes,
      })
    );
    if (error) {
      queryClient.setQueryData(["anilist_data"], previous);
      addNotification(
        t("anilist.controls.save.error"),
        "error",
        error instanceof Error ? error.message : String(error)
      );
    } else {
      queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
    }
    setSaving(false);
  };

  const buttonClass = `h-3.5 w-3.5 shrink-0 focus-visible:visible ${
    saving ? "visible" : "invisible group-hover:visible group-focus-within:visible"
  }`;
  return (
    <span
      className="flex items-center gap-0.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button
        size="icon"
        className={buttonClass}
        title={t("anilist.card.progress.minus")}
        aria-label={t("anilist.card.progress.minus")}
        disabled={saving || atMin}
        onClick={() => step(-1)}
      >
        {saving ? <SmallLoader size={2} /> : <Minus className="size-2.5" />}
      </Button>
      <Button
        size="icon"
        className={buttonClass}
        title={t("anilist.card.progress.plus")}
        aria-label={t("anilist.card.progress.plus")}
        disabled={saving || atMax}
        onClick={() => step(1)}
      >
        {saving ? <SmallLoader size={2} /> : <Plus className="size-2.5" />}
      </Button>
    </span>
  );
}
