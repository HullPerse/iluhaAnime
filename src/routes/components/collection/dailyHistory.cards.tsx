import { Button } from "@/components/ui/button.component";
import { DAILY_MODE_LABEL_KEYS } from "@/config/cards/daily.config";
import { useDailyGameHistory } from "@/hooks/daily/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { formatDailyDate } from "@/lib/daily/format.utils";
import type { DailyHistoryMode } from "@/types/api/daily";

/** The shared journal under every result. `day`/`mode` identify the row on screen. */
export default function DailyHistoryJournal({
  day,
  mode,
}: {
  day: string;
  mode: DailyHistoryMode;
}) {
  const { t } = useI18n();
  const history = useDailyGameHistory(day, mode, true);
  const items = history.data ?? [];

  return (
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
                <th scope="col">{t("collection.game.history.answer")}</th>
                <th scope="col">{t("collection.game.history.attempts")}</th>
                <th scope="col">{t("collection.game.history.result")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const characters = item.mode === "characters";
                const answer = characters
                  ? t("collection.game.characters.score", { count: item.attempts })
                  : item.title.length > 0
                    ? item.title
                    : t("collection.game.history.unknown");

                return (
                  <tr key={`${item.day}-${item.mode}`}>
                    <td className="daily-history-date">{formatDailyDate(item.day)}</td>
                    <td>{t(DAILY_MODE_LABEL_KEYS[item.mode])}</td>
                    <td className="daily-history-title" title={answer}>
                      {answer}
                    </td>
                    <td>
                      {characters ? (
                        <span className="daily-history-empty">—</span>
                      ) : (
                        <>
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
                        </>
                      )}
                    </td>
                    <td>
                      <span className="daily-history-verdict" data-won={item.won}>
                        {t(item.won ? "collection.game.won" : "collection.game.lost")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
