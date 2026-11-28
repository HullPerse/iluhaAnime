import { ContactRound } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCharacters } from "@/hooks/daily/characters.hook";
import CharactersModeArt from "@/routes/components/collection/charactersModeArt.cards";

/** The fourth daily challenge opens independently of video preparation. */
export default function CharactersMode({ day, onStart }: { day: string; onStart: () => void }) {
  const { t } = useI18n();
  const { game } = useCharacters(day, true);

  return (
    <article className="ui-panel daily-mode-card daily-mode-characters">
      <header className="daily-titlebar">
        <ContactRound className="size-3.5" />
        <h3 className="daily-titlebar-title">{t("collection.game.mode.characters")}</h3>
      </header>
      <div className="daily-mode-body">
        <div className="windows95-border daily-mode-art-frame">
          <CharactersModeArt />
        </div>
        <div className="daily-mode-copy">
          <p>{t("collection.game.characters.modeDescription")}</p>
          <div className="daily-mode-actions">
            <Button className="daily-mode-start" onClick={onStart}>
              {t(game.data?.finished ? "collection.game.result" : "collection.game.start")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
