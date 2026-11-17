import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button.component";
import { useGuessDailyAudio, useSkipDailyAudio } from "@/hooks/daily/queries.hook";
import { useDailyRewardNotice } from "@/hooks/daily/reward.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { clipStart } from "@/lib/daily/clip.utils";
import { audioStage, canOpenAudioStage, shownAudioStage } from "@/lib/daily/stage.utils";
import type { DailyOpGuessView, DailyOpView, DailyResultView } from "@/types/api/daily";
import AudioBlank from "@/routes/components/collection/audioBlank.cards";
import AudioCover from "@/routes/components/collection/audioCover.cards";
import { ClipPlayer } from "@/routes/components/collection/gameClip.cards";

import { FramePips, GuessHistory, Result } from "@/routes/components/collection/gameFrames.cards";
import DailyGuessField from "@/routes/components/collection/dailyGuessField.cards";
import type { DailyGuessSuggestion, GuessHistoryItem } from "@/types/ui/daily";

const AUDIO_SECONDS = 15;

function audioStart(duration: number, fraction: number): number {
  return Math.min(clipStart(duration, fraction), Math.max(0, duration - AUDIO_SECONDS));
}

export default function GameAudio({
  day,
  initial,
  onClose,
}: {
  day: string;
  initial: DailyOpView;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const guess = useGuessDailyAudio(day);
  const skip = useSkipDailyAudio(day);
  const [attempts, setAttempts] = useState(initial.attempts);
  const [result, setResult] = useState<DailyResultView | null>(initial.result);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DailyGuessSuggestion | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [fullPath, setFullPath] = useState(initial.fullPath);
  const [showFullClip, setShowFullClip] = useState(false);
  const [viewStage, setViewStage] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startRef = useRef(0);
  const clipUrl = convertFileSrc(initial.clipPath);
  const resultClipUrl = convertFileSrc(fullPath.length > 0 ? fullPath : initial.clipPath);
  useDailyRewardNotice(result, t);

  const remaining = Math.max(0, initial.maxAttempts - attempts);
  // Three looks at the same 15-second excerpt: blackout, mosaic, plain clip.
  const stage = audioStage(attempts, initial.maxAttempts);
  const shownStage = shownAudioStage(stage, viewStage);
  const stageLabel =
    shownStage === 0
      ? "collection.game.audio.only"
      : shownStage === 1
        ? "collection.game.audio.mosaic"
        : "collection.game.audio.video";
  const pending = guess.isPending || skip.isPending;

  const handleLoadedMetadata = (duration: number) => {
    startRef.current = audioStart(duration, initial.startFraction);
  };

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (
      video.currentTime < startRef.current - 0.05 ||
      video.currentTime >= startRef.current + AUDIO_SECONDS - 0.05
    ) {
      video.currentTime = startRef.current;
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime >= startRef.current + AUDIO_SECONDS) {
      video.pause();
    }
  };

  const applyView = (view: DailyOpGuessView) => {
    setAttempts(view.state.attempts);
    setFullPath(view.state.fullPath);
    setViewStage(null);
    if (view.state.result !== null) {
      setResult(view.state.result);
      setShowFullClip(true);
    }
    setQuery("");
    setSelected(null);
  };

  const selectStage = (slot: number) => {
    if (!canOpenAudioStage(slot, stage)) return;
    setViewStage(slot);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = startRef.current;
    ignore(video.play());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected === null || pending) return;
    const guessed = selected;
    guess.mutate(
      {
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

  const skipRound = () => {
    if (pending || result !== null) return;
    skip.mutate(undefined, { onSuccess: applyView });
  };

  if (result !== null) {
    return (
      <div className="daily-play">
        {showFullClip ? (
          <section className="daily-reveal">
            <ClipPlayer
              key={resultClipUrl}
              clipUrl={resultClipUrl}
              videoRef={videoRef}
              startFraction={initial.startFraction}
              timeLabel={t("collection.game.op.full")}
              startAtZero
              showTimeline
              onLoadedMetadata={() => undefined}
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
        ) : (
          <Result
            result={result}
            frame={null}
            day={day}
            mode="audio"
            maxAttempts={initial.maxAttempts}
            onClose={onClose}
          />
        )}
      </div>
    );
  }

  return (
    <div className="daily-play">
      <div className="daily-audio-layout">
        <section className="daily-stage">
          <ClipPlayer
            clipUrl={clipUrl}
            videoRef={videoRef}
            startFraction={initial.startFraction}
            timeLabel={t("collection.game.audio.length")}
            clipSeconds={AUDIO_SECONDS}
            cover={
              shownStage === 0 ? (
                <AudioBlank />
              ) : shownStage === 1 ? (
                <AudioCover videoRef={videoRef} />
              ) : null
            }
            badge={<span className="daily-audio-tag">{t(stageLabel)}</span>}
            onLoadedMetadata={handleLoadedMetadata}
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
              selected={viewStage}
              onSelect={selectStage}
              openLabelKey="collection.game.audio.stage"
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
              onClick={skipRound}
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
                <h3 className="daily-answer-history-title">{t("collection.game.lastAttempts")}</h3>
                <GuessHistory history={history} />
              </section>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
