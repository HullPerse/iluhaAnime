import { Button } from "@/components/ui/button.component";
import { useCharacters } from "@/hooks/daily/characters.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import CharactersForm from "@/routes/components/collection/charactersForm.cards";
import CharactersResult from "@/routes/components/collection/charactersResult.cards";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

/** Fill the whole sheet, review its verdicts, then open the result journal. */
export default function GameCharacters({ day, onClose }: { day: string; onClose: () => void }) {
  const { t } = useI18n();
  const { game } = useCharacters(day, true);
  const data = game.data;
  const [showResult, setShowResult] = useState(false);

  if (data?.finished && showResult) return <CharactersResult view={data} onClose={onClose} />;

  return (
    <section className="daily-play daily-character-game">
      <header className="daily-stage-controls">
        <Button
          size="icon"
          variant="ghost"
          className="daily-play-back"
          aria-label={t("collection.game.back")}
          onClick={onClose}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="daily-round-label">{t("collection.game.mode.characters")}</span>
      </header>
      {game.isPending && <p role="status">{t("collection.game.state.pending")}</p>}
      {game.isError && (
        <div role="alert">
          <p>{t("collection.game.error")}</p>
          <Button onClick={() => ignore(game.refetch())}>{t("collection.retry")}</Button>
        </div>
      )}
      {data && (
        <>
          <CharactersForm view={data} onResult={() => setShowResult(true)} />
        </>
      )}
    </section>
  );
}
