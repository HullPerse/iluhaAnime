import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { EntryListInfo } from "@/lib/anilist/entries.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
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

interface LiveEntryFields {
  status: string;
  score: number | null;
  notes: string | null;
}

function readLiveFields(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number,
  fallback: LiveEntryFields
): LiveEntryFields {
  const data = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
  if (data) {
    for (const list of data.lists) {
      const found = list.entries.find((item) => item.media.id === mediaId);
      if (found) return { status: found.list_status, score: found.score, notes: found.notes };
    }
  }
  return fallback;
}

function clampProgress(value: number, max: number | null): number {
  if (max != null) return Math.min(max, Math.max(0, value));
  return Math.max(0, value);
}

function shortReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}

interface StepperFailure {
  target: number;
  reason: string;
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
  const [failure, setFailure] = useState<StepperFailure | null>(null);
  const targetRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const confirmedRef = useRef(entry.progress ?? 0);
  const entryRef = useRef(entry);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useEffect(() => {
    if (targetRef.current === null && !inflightRef.current) {
      confirmedRef.current = entry.progress ?? 0;
    }
  }, [entry.progress]);

  const pump = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setSaving(true);
    let synced = false;
    let failed = false;
    while (targetRef.current !== null) {
      const target = targetRef.current;
      const fallback = entryRef.current;
      const live = readLiveFields(queryClient, media.id, {
        status: fallback.list_status,
        score: fallback.score,
        notes: fallback.notes,
      });
      const startedAt = performance.now();
      const [, error] = await attempt(
        anilistApi.saveEntry({
          mediaId: media.id,
          status: live.status,
          progress: target,
          score: live.score,
          notes: live.notes,
        })
      );
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (error) {
        const reason = shortReason(error);
        patchProgress(queryClient, media.id, confirmedRef.current);
        targetRef.current = null;
        setFailure({ target, reason });
        console.warn("anilist.stepper.failed", {
          elapsedMs,
          mediaId: media.id,
          progress: target,
          error: reason,
        });
        addNotification(t("anilist.controls.save.error.detail", { error: reason }), "error");
        failed = true;
        break;
      }
      confirmedRef.current = target;
      synced = true;
      if (targetRef.current === target) targetRef.current = null;
    }
    targetRef.current = null;
    inflightRef.current = false;
    setSaving(false);
    if (synced && !failed) {
      queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
    }
  }, [media.id, queryClient, t]);

  const step = (delta: 1 | -1) => {
    const base = targetRef.current ?? confirmedRef.current;
    const next = clampProgress(base + delta, media.episodes);
    if (next === base) return;
    targetRef.current = next;
    setFailure(null);
    patchProgress(queryClient, media.id, next);
    ignore(pump());
  };

  const retry = () => {
    if (failure === null || inflightRef.current) return;
    targetRef.current = failure.target;
    const target = failure.target;
    setFailure(null);
    patchProgress(queryClient, media.id, target);
    ignore(pump());
  };

  const progress = entry.progress ?? 0;
  const max = media.episodes;
  const atMin = progress <= 0;
  const atMax = max != null && progress >= max;

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
        disabled={atMin}
        onClick={() => step(-1)}
      >
        {saving ? <SmallLoader size={2} /> : <Minus className="size-2.5" />}
      </Button>
      <Button
        size="icon"
        className={buttonClass}
        title={t("anilist.card.progress.plus")}
        aria-label={t("anilist.card.progress.plus")}
        disabled={atMax}
        onClick={() => step(1)}
      >
        {saving ? <SmallLoader size={2} /> : <Plus className="size-2.5" />}
      </Button>
      {failure !== null && (
        <Button
          size="icon"
          className="h-3.5 w-3.5 shrink-0"
          title={failure.reason}
          aria-label={t("anilist.details.retry")}
          disabled={saving}
          onClick={retry}
        >
          <RotateCcw className="size-2.5" />
        </Button>
      )}
    </span>
  );
}
