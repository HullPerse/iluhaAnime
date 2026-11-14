import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowLeft, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useGuessDailyAudio, useSkipDailyAudio } from "@/hooks/daily/queries.hook";
import { useDailyRewardNotice } from "@/hooks/daily/reward.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { clipStart } from "@/lib/daily/clip.utils";
import { audioStage, canOpenAudioStage, shownAudioStage } from "@/lib/daily/stage.utils";
import { matchingAlias, rankSuggestions } from "@/lib/daily/search.utils";
import type { AniMedia } from "@/types/anilist/anilist";
import type { DailyOpGuessView, DailyOpView, DailyResultView } from "@/types/api/daily";
import AudioBlank from "@/routes/components/collection/audioBlank.cards";
import AudioCover from "@/routes/components/collection/audioCover.cards";
import { ClipPlayer } from "@/routes/components/collection/gameClip.cards";

import {
  FramePips,
  GuessHistory,
  Result,
  canSearchDaily,
} from "@/routes/components/collection/gameFrames.cards";
import type { GuessHistoryItem } from "@/types/ui/daily";

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
  const [selected, setSelected] = useState<AniMedia | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [fullPath, setFullPath] = useState(initial.fullPath);
  const [viewStage, setViewStage] = useState<number | null>(null);
  const [debouncedQuery] = useDebouncedValue(query.trim(), { wait: 250 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const startRef = useRef(0);
  const clipUrl = convertFileSrc(initial.clipPath);
  const resultClipUrl = convertFileSrc(fullPath.length > 0 ? fullPath : initial.clipPath);
  useDailyRewardNotice(result, t);

  const canSearch = canSearchDaily(result, debouncedQuery);
  const search = useAppQuery<AniMedia[]>("static", {
    queryKey: queryKeys.dailySearch(debouncedQuery),
    queryFn: () => anilistApi.search({ query: debouncedQuery, perPage: 8 }),
    enabled: canSearch,
  });

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
  const suggestions = rankSuggestions(search.data ?? [], debouncedQuery).slice(0, 6);

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
    if (view.state.result !== null) setResult(view.state.result);
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
        guessedTitles: [guessed.title, ...guessed.titles],
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
        <div className="daily-audio-result">
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
          <Result
            result={result}
            frame={null}
            day={day}
            mode="audio"
            maxAttempts={initial.maxAttempts}
            onClose={onClose}
          />
        </div>
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
            <div className="daily-search">
              <Search />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                }}
                className="daily-search-input"
                placeholder={t("collection.game.guess.placeholder")}
                aria-label={t("collection.game.guess.placeholder")}
                autoFocus
                disabled={pending}
              />
            </div>

            {selected !== null && (
              <div className="windows95-border daily-selected">
                {selected.cover_url !== null && (
                  <Image
                    src={selected.cover_url}
                    alt={selected.title}
                    className="daily-selected-cover"
                  />
                )}
                <div className="daily-selected-copy">
                  <strong>{selected.title}</strong>
                  <span>{t("collection.game.selected")}</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  className="daily-mini-btn"
                  aria-label={t("collection.game.clearAnswer")}
                  title={t("collection.game.clearAnswer")}
                  onClick={() => {
                    setSelected(null);
                    setQuery("");
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}

            {selected === null && suggestions.length > 0 && (
              <div className="windows95-border daily-suggestions">
                {suggestions.map((media) => (
                  <button
                    key={media.id}
                    type="button"
                    className="daily-suggestion"
                    onClick={() => {
                      setSelected(media);
                      setQuery(media.title);
                    }}
                  >
                    {media.cover_url !== null && (
                      <Image src={media.cover_url} alt="" className="daily-suggestion-cover" />
                    )}
                    <span className="daily-suggestion-copy">
                      <strong>{media.title}</strong>
                      <span className="daily-suggestion-meta">
                        {[matchingAlias(media, debouncedQuery), media.season_year, media.format]
                          .filter((value) => value !== null)
                          .join(" / ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

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
