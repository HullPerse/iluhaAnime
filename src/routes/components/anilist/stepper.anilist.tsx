import { useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { EntryListInfo } from "@/types/anilist/entries";
import type { AniMedia } from "@/types/anilist/anilist";
import { Debouncer } from "@/lib/core/debounce.utils";
import { scheduleTask } from "@/lib/core/shared.utils";
import type { ScheduledTask } from "@/types/core/shared";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import {
  patchEntry,
  readLiveFields,
  clampProgress,
  resolveSaveStatus,
  shortReason,
  STEPPER_SYNC_WAIT_MS,
  STEPPER_SYNC_MAX_WAIT_MS,
  STEPPER_SAVED_MS,
} from "@/lib/anilist/progressStepper.utils";
import type { StepperFailure, StepperPhase } from "@/lib/anilist/progressStepper.utils";
import { markOwnAnilistListStatus } from "@/store/anilist.store";
import { anilistProgressOverride } from "@/store/anilistProgress.store";
import { addNotification } from "@/store/notification.store";

export function ProgressStepper({
  media,
  entry,
  progress,
}: {
  media: Pick<AniMedia, "id" | "episodes">;
  entry: EntryListInfo;
  progress: number;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<StepperPhase>("idle");
  const [failure, setFailure] = useState<StepperFailure | null>(null);
  const targetRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const statusInvalidateRef = useRef(false);
  const confirmedRef = useRef(entry.progress ?? 0);
  const entryRef = useRef(entry);
  const savedTimer = useRef<ScheduledTask | null>(null);
  const taskBox = useMemo<{ current: (() => void) | undefined }>(
    () => ({ current: undefined }),
    []
  );
  const debouncer = useMemo(
    () =>
      new Debouncer<[]>(() => taskBox.current?.(), {
        wait: STEPPER_SYNC_WAIT_MS,
        maxWait: STEPPER_SYNC_MAX_WAIT_MS,
      }),
    [taskBox]
  );
  const pending = useCell(debouncer.status).isPending;

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useEffect(() => {
    if (targetRef.current === null && !inflightRef.current) {
      confirmedRef.current = entry.progress ?? 0;
    }
  }, [entry.progress]);

  useEffect(
    () => () => {
      debouncer.flush();
      savedTimer.current?.cancel();
      savedTimer.current = null;
    },
    [debouncer]
  );

  const clearSaved = useCallback(() => {
    savedTimer.current?.cancel();
    savedTimer.current = null;
  }, []);

  const sendPending = useCallback(async () => {
    const target = targetRef.current;
    if (target === null || inflightRef.current) return;
    targetRef.current = null;
    inflightRef.current = true;
    setPhase("syncing");
    const fallback = entryRef.current;
    const live = readLiveFields(queryClient, media.id, {
      status: fallback.list_status,
      score: fallback.score,
      notes: fallback.notes,
    });
    const nextStatus = resolveSaveStatus(target, media.episodes, live.status);
    const startedAt = performance.now();
    const [saved, error] = await attempt(
      anilistApi.saveEntry({
        mediaId: media.id,
        status: nextStatus,
        progress: target,
        score: live.score,
        notes: live.notes,
      })
    );
    const elapsedMs = Math.round(performance.now() - startedAt);
    inflightRef.current = false;
    const superseded = targetRef.current !== null;
    if (error) {
      const reason = shortReason(error);
      if (superseded) {
        setPhase("idle");
      } else {
        patchEntry(queryClient, media.id, { progress: confirmedRef.current });
        anilistProgressOverride.clear(media.id);
        if (statusInvalidateRef.current) {
          statusInvalidateRef.current = false;
          ignore(queryClient.invalidateQueries({ queryKey: queryKeys.anilistData() }));
        }
        setFailure({ target, reason });
        setPhase("error");
      }
      console.warn("anilist.stepper.failed", {
        elapsedMs,
        mediaId: media.id,
        progress: target,
        error: reason,
      });
      addNotification(t("anilist.controls.save.error.detail", { error: reason }), "error");
    } else {
      const confirmed = saved?.progress ?? target;
      const confirmedStatus = saved?.status ?? nextStatus;
      confirmedRef.current = confirmed;
      const returnedCustomLists = saved?.customLists ?? [];
      if (confirmedStatus !== live.status) statusInvalidateRef.current = true;
      markOwnAnilistListStatus(media.id, confirmedStatus);
      patchEntry(queryClient, media.id, {
        progress: confirmed,
        list_status: confirmedStatus,
        ...(returnedCustomLists.length > 0 ? { custom_lists: returnedCustomLists } : {}),
      });
      if (!superseded) {
        anilistProgressOverride.clear(media.id);
        if (statusInvalidateRef.current) {
          statusInvalidateRef.current = false;
          ignore(queryClient.invalidateQueries({ queryKey: queryKeys.anilistData() }));
        }
      }
      setPhase("saved");
      clearSaved();
      savedTimer.current = scheduleTask("timeout", STEPPER_SAVED_MS, () => setPhase("idle"));
    }
    if (superseded) debouncer.maybeExecute();
  }, [debouncer, media.id, media.episodes, queryClient, t, clearSaved]);

  useEffect(() => {
    taskBox.current = () => {
      ignore(sendPending());
    };
  });

  const optimisticStatus = (target: number): string | null => {
    const fallback = entryRef.current;
    const live = readLiveFields(queryClient, media.id, {
      status: fallback.list_status,
      score: fallback.score,
      notes: fallback.notes,
    });
    const status = resolveSaveStatus(target, media.episodes, live.status);
    return status === live.status ? null : status;
  };

  const step = (delta: 1 | -1) => {
    const base =
      targetRef.current ?? anilistProgressOverride.get(media.id)?.progress ?? confirmedRef.current;
    const next = clampProgress(base + delta, media.episodes);
    if (next === base) return;
    targetRef.current = next;
    setFailure(null);
    clearSaved();
    setPhase((prev) => (prev === "error" || prev === "saved" ? "idle" : prev));
    anilistProgressOverride.set(media.id, next, optimisticStatus(next));
    if (!inflightRef.current) debouncer.maybeExecute();
  };

  const retry = () => {
    if (failure === null || inflightRef.current) return;
    if (targetRef.current !== null) return;
    const target = failure.target;
    targetRef.current = target;
    setFailure(null);
    setPhase("idle");
    anilistProgressOverride.set(media.id, target, optimisticStatus(target));
    debouncer.maybeExecute();
  };

  const max = media.episodes;
  const atMin = progress <= 0;
  const atMax = max != null && progress >= max;

  const buttonClass =
    "h-3.5 w-3.5 shrink-0 focus-visible:visible invisible group-hover:visible group-focus-within:visible";
  const statusClass = "flex h-3.5 w-3.5 shrink-0 items-center justify-center";
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
        <Minus className="size-2.5" />
      </Button>
      <Button
        size="icon"
        className={buttonClass}
        title={t("anilist.card.progress.plus")}
        aria-label={t("anilist.card.progress.plus")}
        disabled={atMax}
        onClick={() => step(1)}
      >
        <Plus className="size-2.5" />
      </Button>
      {phase === "error" && failure !== null ? (
        <Button
          size="icon"
          className="h-3.5 w-3.5 shrink-0"
          title={failure.reason}
          aria-label={t("anilist.details.retry")}
          onClick={retry}
        >
          <RotateCcw className="size-2.5" />
        </Button>
      ) : phase === "saved" ? (
        <span
          className={statusClass}
          title={t("anilist.card.progress.saved")}
          aria-label={t("anilist.card.progress.saved")}
        >
          <Check className="size-2.5" />
        </span>
      ) : pending || phase === "syncing" ? (
        <span className={statusClass} aria-hidden="true">
          <SmallLoader size={2} />
        </span>
      ) : null}
    </span>
  );
}
