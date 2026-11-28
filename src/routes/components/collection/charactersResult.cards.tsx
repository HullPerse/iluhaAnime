import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import CharactersModeArt from "@/routes/components/collection/charactersModeArt.cards";
import { formatDailyDate } from "@/lib/daily/format.utils";
import type { CharactersView } from "@/types/api/characters";

/** Use the existing result stage and journal styling for the five-answer sheet. */
export default function CharactersResult({
  view,
  onClose,
}: {
  view: CharactersView;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const won = view.correct >= 6;

  return (
    <section className="daily-result" data-won={won}>
      <div className="daily-result-veil" aria-hidden />
      <div className="daily-result-stage">
        <div className="daily-result-poster daily-character-result-art">
          <CharactersModeArt />
          <span className="daily-result-stamp">
            {t(won ? "collection.game.won" : "collection.game.lost")}
          </span>
        </div>
        <div className="daily-result-copy">
          <p className="daily-result-kicker">{t("collection.game.result")}</p>
          <h2 className="daily-result-title">{t("collection.game.mode.characters")}</h2>
          <p className="daily-result-facts">{formatDailyDate(view.day)}</p>
          <p className="daily-character-result-score">{view.correct} / 10</p>
          <p>
            {t(
              view.rewardPackId
                ? "collection.game.characters.reward"
                : "collection.game.characters.noReward"
            )}
          </p>
          <div className="daily-result-actions">
            <Button onClick={onClose}>{t("collection.game.back")}</Button>
          </div>
        </div>
      </div>
      <section className="daily-result-history" aria-label={t("collection.game.history")}>
        <div className="daily-history-divider">
          <span>{t("collection.game.history")}</span>
        </div>
        <div className="daily-history-list windows95-active-border">
          <table className="daily-history-table daily-character-history">
            <thead>
              <tr>
                <th>{t("collection.game.history.date")}</th>
                <th>{t("collection.game.characters.scoreLabel")}</th>
                <th>{t("collection.game.result")}</th>
              </tr>
            </thead>
            <tbody>
              {view.history.map((row) => (
                <tr key={row.day}>
                  <td>{formatDailyDate(row.day)}</td>
                  <td>{row.correct}/10</td>
                  <td>{t(row.correct >= 6 ? "collection.game.won" : "collection.game.lost")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
