import { ImageOff, Star } from "lucide-react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useDailyGameHistory } from "@/hooks/daily/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { MAX_DAILY_FRAMES, DAILY_MODE_LABEL_KEYS } from "@/config/cards/daily.config";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { formatDailyDate } from "@/lib/daily/format.utils";
import type { AniMedia } from "@/types/anilist/anilist";
import type { DailyFrameView, DailyMode, DailyResultView } from "@/types/api/daily";

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
  const history = useDailyGameHistory(day, mode, true);
  const items = history.data ?? [];
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

      <section className="daily-result-history" aria-label={t("collection.game.history")}>
        <div className="daily-history-divider">
          <span>{t("collection.game.history")}</span>
        </div>
        {history.isPending ? (
          <p className="daily-history-note">{t("collection.loading")}</p>
        ) : history.isError ? (
          <div className="daily-history-note daily-history-error" role="alert">
            <span>{t("collection.game.history.error")}</span>
            <Button onClick={() => ignore(history.refetch())}>{t("collection.retry")}</Button>
          </div>
        ) : (
          <div className="daily-history-list windows95-active-border">
            <table className="daily-history-table">
              <thead>
                <tr>
                  <th scope="col">{t("collection.game.history.date")}</th>
                  <th scope="col">{t("collection.game.history.mode")}</th>
                  <th scope="col">{t("collection.game.history.anime")}</th>
                  <th scope="col">{t("collection.game.history.attempts")}</th>
                  <th scope="col">{t("collection.game.history.result")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.day}-${item.mode}`}>
                    <td className="daily-history-date">{formatDailyDate(item.day)}</td>
                    <td>{t(DAILY_MODE_LABEL_KEYS[item.mode])}</td>
                    <td className="daily-history-title" title={item.title}>
                      {item.title.length > 0 ? item.title : t("collection.game.history.unknown")}
                    </td>
                    <td>
                      <span className="daily-history-pips" aria-hidden>
                        {Array.from({ length: item.maxAttempts }, (_, index) => (
                          <span
                            key={index}
                            className="daily-history-pip"
                            data-state={
                              index < item.attempts - 1
                                ? "done"
                                : index === item.attempts - 1
                                  ? item.won
                                    ? "correct"
                                    : "wrong"
                                  : "future"
                            }
                          />
                        ))}
                      </span>
                      <span className="daily-history-sr">
                        {item.attempts} / {item.maxAttempts}
                      </span>
                    </td>
                    <td>
                      <span className="daily-history-verdict" data-won={item.won}>
                        {t(item.won ? "collection.game.won" : "collection.game.lost")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
