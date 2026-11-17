import { ArrowLeft, Lightbulb } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import {
  useGuessDailyGame,
  useRevealDailyFrames,
  useSkipDailyGame,
} from "@/hooks/daily/queries.hook";
import { useDailyRewardNotice } from "@/hooks/daily/reward.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { hintLabelFor } from "@/lib/daily/hints.utils";
import type { DailyFrameView, DailyFramesView, DailyResultView } from "@/types/api/daily";
import type { DailyGuessSuggestion, GuessHistoryItem } from "@/types/ui/daily";

import DailyGuessField from "@/routes/components/collection/dailyGuessField.cards";
import FramesReveal from "@/routes/components/collection/framesReveal.cards";
import { FramePips } from "@/routes/components/collection/framePips.cards";
import { Result } from "@/routes/components/collection/gameResult.cards";
import { GuessHistory } from "@/routes/components/collection/guessHistory.cards";
import { HintsRail } from "@/routes/components/collection/hintsRail.cards";

export { FramePips } from "@/routes/components/collection/framePips.cards";
export { Result } from "@/routes/components/collection/gameResult.cards";
export { GuessHistory } from "@/routes/components/collection/guessHistory.cards";
export { HintsRail } from "@/routes/components/collection/hintsRail.cards";

function mergeFrame(frames: DailyFrameView[], next: DailyFrameView): DailyFrameView[] {
  if (frames.some((frame) => frame.slot === next.slot)) return frames;
  return [...frames, next].sort((left, right) => left.slot - right.slot);
}

export default function GameFrames({
  day,
  initial,
  onClose,
}: {
  day: string;
  initial: DailyFramesView;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const guess = useGuessDailyGame(day);
  const skip = useSkipDailyGame(day);
  const reveal = useRevealDailyFrames(day);
  const [frames, setFrames] = useState<DailyFrameView[]>(initial.frames);
  const [attempts, setAttempts] = useState(initial.attempts);
  const [result, setResult] = useState<DailyResultView | null>(initial.result);
  const [showReveal, setShowReveal] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DailyGuessSuggestion | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [viewSlot, setViewSlot] = useState<number | null>(null);
  useDailyRewardNotice(result, t);

  const current = frames.find((frame) => frame.slot === viewSlot) ?? frames.at(-1);
  const currentHint = current !== undefined && current.slot > 0 ? hintLabelFor(current, t) : null;
  const hints = frames.filter((frame) => frame.slot > 0);
  const remaining = Math.max(0, initial.maxAttempts - attempts);
  const pending = guess.isPending || skip.isPending;

  const loadAllFrames = () =>
    reveal.mutate(undefined, { onSuccess: (view) => setFrames(view.frames) });

  const applyView = (view: {
    attempts: number;
    frame: DailyFrameView | null;
    result: DailyResultView | null;
  }) => {
    setAttempts(view.attempts);
    let nextFrames = frames;
    if (view.frame !== null) {
      nextFrames = mergeFrame(frames, view.frame);
      setFrames(nextFrames);
    }
    setViewSlot(null);
    if (view.result !== null) {
      setResult(view.result);
      setShowReveal(true);
      setFrames([]);
      loadAllFrames();
    }
    setQuery("");
    setSelected(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected === null || pending) return;
    const guessed = selected;
    guess.mutate(
      {
        mode: "frames",
        mediaId: guessed.id,
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

  const skipFrame = () => {
    if (pending || result !== null) return;
    skip.mutate("frames", { onSuccess: applyView });
  };

  return (
    <div className="daily-play">
      {result !== null && showReveal ? (
        <FramesReveal
          frames={frames}
          maxAttempts={initial.maxAttempts}
          error={reveal.error}
          retrying={reveal.isPending}
          onRetry={loadAllFrames}
          onDone={() => setShowReveal(false)}
        />
      ) : result !== null ? (
        <Result result={result} frame={current ?? null} day={day} mode="frames" onClose={onClose} />
      ) : (
        <div className="daily-play-layout">
          <section className="daily-stage">
            <div className="windows95-border daily-frame-shell">
              {current !== undefined ? (
                <img key={current.slot} src={current.dataUrl} alt="" className="daily-frame" />
              ) : (
                <div className="daily-frame-empty">
                  <SmallLoader size={8} />
                </div>
              )}
              {currentHint !== null && (
                <span className="daily-frame-hint">
                  <Lightbulb className="size-3 shrink-0" />
                  <span>{currentHint}</span>
                </span>
              )}
            </div>

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
                selected={viewSlot}
                onSelect={(slot) => setViewSlot(slot === attempts ? null : slot)}
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
                onClick={skipFrame}
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

          <HintsRail hints={hints} current={current} />
        </div>
      )}
    </div>
  );
}
