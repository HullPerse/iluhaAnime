import { ImageOff, Star } from "lucide-react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { MAX_DAILY_FRAMES } from "@/config/cards/daily.config";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type { AniMedia } from "@/types/anilist/anilist";
import type { DailyFrameView, DailyMode, DailyResultView } from "@/types/api/daily";

import DailyHistoryJournal from "@/routes/components/collection/dailyHistory.cards";
import { FramePips } from "@/routes/components/collection/framePips.cards";

export function Result({
  result,
  frame,
  day,
  mode,
  maxAttempts = MAX_DAILY_FRAMES,
  onClose,
}: {
  result: DailyResultView;
  frame: DailyFrameView | null;
  day: string;
  mode: DailyMode;
  maxAttempts?: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const answer = useAppQuery<AniMedia>("static", {
    queryKey: queryKeys.dailyAnswer(result.answer.mediaId),
    queryFn: () => anilistApi.getAnimeById(result.answer.mediaId),
  });
  const cover = answer.data?.cover_url ?? null;
  const facts = [
    result.answer.year?.toString() ?? null,
    result.answer.format,
    result.answer.episodes !== null
      ? `${result.answer.episodes} ${t("anilist.details.eps.short")}`
      : null,
    result.answer.studio,
  ].filter((value): value is string => value !== null);

  return (
    <section className="daily-result" data-won={result.won}>
      {frame !== null && (
        <img src={frame.dataUrl} alt="" aria-hidden className="daily-result-backdrop" />
      )}
      <div className="daily-result-veil" aria-hidden />

      <div className="daily-result-stage">
        <div className="daily-result-poster">
          {cover !== null ? (
            <Image
              src={cover}
              alt={result.answer.title}
              width={460}
              height={650}
              className="daily-result-cover"
            />
          ) : answer.isPending ? (
            <div className="daily-result-cover-fallback" aria-busy="true">
              <SmallLoader size={8} />
            </div>
          ) : (
            <div
              className="daily-result-cover-fallback"
              role="img"
              aria-label={t("image.unavailable")}
            >
              <ImageOff aria-hidden className="size-7" />
              <span>{t("image.fallback")}</span>
            </div>
          )}
          <span className="daily-result-stamp">
            {t(result.won ? "collection.game.won" : "collection.game.lost")}
          </span>
        </div>

        <div className="daily-result-copy">
          <p className="daily-result-kicker">{t("collection.game.result")}</p>
          <h2 className="daily-result-title">{result.answer.title}</h2>
          {facts.length > 0 && <p className="daily-result-facts">{facts.join(" / ")}</p>}
          {result.answer.genres.length > 0 && (
            <p className="daily-result-genres">{result.answer.genres.join(" / ")}</p>
          )}

          <div className="daily-result-meta">
            {result.answer.score !== null && (
              <span className="daily-result-score">
                <Star className="size-3 fill-current" />
                {result.answer.score}
              </span>
            )}
            <span className="daily-result-tries">
              {t("collection.game.attempts", { used: result.attempts, max: maxAttempts })}
            </span>
          </div>

          <FramePips attempts={result.attempts} result={result} total={maxAttempts} />

          <div className="daily-result-actions">
            <Button onClick={onClose}>{t("collection.game.back")}</Button>
          </div>
        </div>
      </div>

      <DailyHistoryJournal day={day} mode={mode} />
    </section>
  );
}
