import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button.component";
import { useGuessDailyOp, useSkipDailyOp } from "@/hooks/daily/queries.hook";
import { useDailyRewardNotice } from "@/hooks/daily/reward.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { formatClock } from "@/lib/core/text/time.utils";
import { clipEnd, clipStart, windowSecondsFor } from "@/lib/daily/clip.utils";
import type { DailyHintView, DailyOpGuessView, DailyOpView } from "@/types/api/daily";
import { ClipPlayer } from "@/routes/components/collection/gameClip.cards";

import {
  FramePips,
  GuessHistory,
  HintsRail,
  Result,
} from "@/routes/components/collection/gameFrames.cards";
import DailyGuessField from "@/routes/components/collection/dailyGuessField.cards";
import type { DailyGuessSuggestion, GuessHistoryItem } from "@/types/ui/daily";

export default function GameOp({
  day,
  initial,
  onClose,
}: {
  day: string;
  initial: DailyOpView;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const guess = useGuessDailyOp(day);
  const skip = useSkipDailyOp(day);
  const [attempts, setAttempts] = useState(initial.attempts);
  const [result, setResult] = useState(initial.result);
  const [showFullClip, setShowFullClip] = useState(false);
  const [viewAttempt, setViewAttempt] = useState<number | null>(null);
  const [hints, setHints] = useState<DailyHintView[]>(initial.hints);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DailyGuessSuggestion | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const durationRef = useRef(0);
  const clipUrl = convertFileSrc(initial.clipPath);
  useDailyRewardNotice(result, t);

  const shownAttempt = viewAttempt ?? attempts;
  const windowSeconds = windowSecondsFor(shownAttempt, initial.maxAttempts);
  const currentHint = hints.find((hint) => hint.slot === shownAttempt) ?? hints.at(-1);
  const remaining = Math.max(0, initial.maxAttempts - attempts);
  const pending = guess.isPending || skip.isPending;

  const resetClip = () => {
    const video = videoRef.current;
    const duration = durationRef.current;
    if (!video || duration <= 0) return;
    video.pause();
    video.currentTime = clipStart(duration, initial.startFraction);
  };

  const applyView = (view: DailyOpGuessView) => {
    setAttempts(view.state.attempts);
    setViewAttempt(null);
    setHints(view.state.hints);
    if (view.state.result !== null) {
      setResult(view.state.result);
      setShowFullClip(true);
    }
    resetClip();
    setQuery("");
    setSelected(null);
  };

  const handlePlay = () => {
    const video = videoRef.current;
    const duration = durationRef.current;
    if (!video || duration <= 0) return;
    const start = clipStart(duration, initial.startFraction);
    const windowEnd = clipEnd(duration, start, windowSecondsFor(shownAttempt, initial.maxAttempts));
    if (video.currentTime < start - 0.05 || video.currentTime >= windowEnd - 0.05) {
      video.currentTime = start;
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    const duration = durationRef.current;
    if (!video || duration <= 0) return;
    const start = clipStart(duration, initial.startFraction);
    const windowEnd = clipEnd(duration, start, windowSecondsFor(shownAttempt, initial.maxAttempts));
    if (video.currentTime >= windowEnd) video.pause();
  };

  const selectAttempt = (slot: number) => {
    setViewAttempt(slot);
    const video = videoRef.current;
    const duration = durationRef.current;
    if (!video || duration <= 0) return;
    video.currentTime = clipStart(duration, initial.startFraction);
    ignore(video.play());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected === null || pending) return;
    const guessed = selected;
    guess.mutate(
      {
        mediaId: guessed.id,
        guessedTitles: guessed.titles,
      },
      {
        onSuccess: (view) => {
          setHistory((previous) => [
            ...previous,
            { media: guessed, correct: view.correct, franchise: view.sameFranchise },
          ]);
          applyView(view);
        },
      }
    );
  };

  const skipClip = () => {
    if (pending || result !== null) return;
    skip.mutate(undefined, { onSuccess: applyView });
  };

  const clipTimeLabel =
    windowSeconds === null ? t("collection.game.op.full") : formatClock(windowSeconds);

  return (
    <div className="daily-play">
      {result !== null && showFullClip ? (
        <section className="daily-reveal">
          <ClipPlayer
            clipUrl={clipUrl}
            videoRef={videoRef}
            startFraction={initial.startFraction}
            timeLabel={t("collection.game.op.full")}
            overlay={`${initial.themeType} / ${t("collection.game.op.full")}`}
            autoPlay
            startAtZero
            showTimeline
            onLoadedMetadata={(duration) => {
              durationRef.current = duration;
            }}
          />
          <div className="daily-reveal-actions">
            <Button
              className="daily-submit bg-secondary text-title-text"
              onClick={() => setShowFullClip(false)}
            >
              {t("collection.game.toResult")}
            </Button>
          </div>
        </section>
      ) : result !== null ? (
        <Result
          result={result}
          frame={null}
          day={day}
          mode="op"
          maxAttempts={initial.maxAttempts}
          onClose={onClose}
        />
      ) : (
        <div className="daily-play-layout">
          <section className="daily-stage">
            <ClipPlayer
              clipUrl={clipUrl}
              videoRef={videoRef}
              startFraction={initial.startFraction}
              timeLabel={clipTimeLabel}
              overlay={initial.themeType}
              onLoadedMetadata={(duration) => {
                durationRef.current = duration;
              }}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
            />

            <div className="daily-stage-controls">
              <Button
                size="icon"
                variant="ghost"
                className="daily-play-back"
                aria-label={t("collection.game.back")}
                title={t("collection.game.back")}
                onClick={onClose}
              >
                <ArrowLeft className="size-3.5" />
              </Button>
              <FramePips
                attempts={attempts}
                result={null}
                total={initial.maxAttempts}
                selected={viewAttempt}
                onSelect={selectAttempt}
                openLabelKey="collection.game.op.open"
              />
              <span className="daily-round-label">
                {t("collection.game.roundOf", {
                  round: Math.min(attempts + 1, initial.maxAttempts),
                  total: initial.maxAttempts,
                })}
              </span>
              <p className="daily-remaining">
                {t("collection.game.guessesRemaining", { count: remaining })}
              </p>
              <Button
                type="button"
                className="daily-skip"
                onClick={skipClip}
                disabled={pending}
                aria-busy={skip.isPending || undefined}
              >
                {t("collection.game.skip")}
              </Button>
            </div>

            <form className="daily-answer-panel" onSubmit={submit}>
              <DailyGuessField
                enabled={result === null}
                pending={pending}
                query={query}
                selected={selected}
                onQueryChange={setQuery}
                onSelect={setSelected}
              />

              {guess.error !== null && (
                <p className="daily-form-error" role="alert">
                  {guess.error.message}
                </p>
              )}
              {skip.error !== null && (
                <p className="daily-form-error" role="alert">
                  {skip.error.message}
                </p>
              )}

              <div className="daily-answer-actions">
                <Button
                  type="submit"
                  className="daily-submit bg-secondary text-title-text"
                  disabled={selected === null}
                  loading={guess.isPending}
                >
                  {t("collection.game.guess.submit")}
                </Button>
              </div>

              {history.length > 0 && (
                <section className="daily-answer-history">
                  <h3 className="daily-answer-history-title">
                    {t("collection.game.lastAttempts")}
                  </h3>
                  <GuessHistory history={history} />
                </section>
              )}
            </form>
          </section>

          <HintsRail hints={hints} current={currentHint} />
        </div>
      )}
    </div>
  );
}
