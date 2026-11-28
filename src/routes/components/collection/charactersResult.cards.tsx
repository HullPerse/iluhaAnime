import { characterPortrait } from "@/api/characters.api";
import { Button } from "@/components/ui/button.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { formatDailyDate } from "@/lib/daily/format.utils";
import { settingsAtoms } from "@/store/settings.store";
import CharactersModeArt from "@/routes/components/collection/charactersModeArt.cards";
import DailyHistoryJournal from "@/routes/components/collection/dailyHistory.cards";
import type { CharactersView } from "@/types/api/characters";

function ResultPortrait({ day, index, name }: { day: string; index: number; name: string }) {
  const portrait = useAppQuery("static", {
    queryKey: ["daily-character-portrait", day, index],
    queryFn: () =>
      characterPortrait(day, index, effectiveProxyUrl(null, settingsAtoms.anilistProxyUrl.get())),
    retry: false,
    gcTime: 60_000,
  });

  if (!portrait.data) return <span className="daily-character-result-placeholder" aria-hidden />;

  return <img className="daily-character-result-portrait" src={portrait.data} alt={name} />;
}

/** The same stage as the other modes: answer art, verdict, score and the shared journal. */
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
        <div className="daily-result-poster daily-character-result-poster">
          <div className="daily-character-result-grid">
            {view.rounds.map((round, index) => (
              <ResultPortrait
                key={index}
                day={view.day}
                index={index}
                name={round.character.answer ?? t("collection.game.characters.portrait")}
              />
            ))}
            <span className="daily-character-result-tally" aria-hidden>
              <CharactersModeArt />
            </span>
          </div>
          <span className="daily-result-stamp">
            {t(won ? "collection.game.won" : "collection.game.lost")}
          </span>
        </div>

        <div className="daily-result-copy">
          <p className="daily-result-kicker">{t("collection.game.result")}</p>
          <h2 className="daily-result-title">{t("collection.game.mode.characters")}</h2>
          <p className="daily-result-facts">{formatDailyDate(view.day)}</p>
          <div className="daily-result-meta">
            <span className="daily-result-score">{view.correct} / 10</span>
          </div>
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

      <DailyHistoryJournal day={view.day} mode="characters" />
    </section>
  );
}
