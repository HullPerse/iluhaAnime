import { useState } from "react";
import { Button } from "@/components/ui/button.component";
import { useCharacters, useCharactersSearchIndex } from "@/hooks/daily/characters.hook";
import { useDailyRewardNotice } from "@/hooks/daily/reward.hook";
import { useI18n } from "@/hooks/i18n.hook";
import CharacterRound from "@/routes/components/collection/characterRound.cards";
import type { CharactersView } from "@/types/api/characters";

/** Drafts save on blur; only the explicit submit checks the ten answers. */
export default function CharactersForm({
  view,
  onResult,
}: {
  view: CharactersView;
  onResult: () => void;
}) {
  const { t } = useI18n();
  const { guess } = useCharacters(view.day, true);
  const suggestions = useCharactersSearchIndex();
  useDailyRewardNotice(guess.data ?? null, t);
  const [answers, setAnswers] = useState(() =>
    view.rounds.map((round) => ({
      character: round.character.submitted,
      anime: round.anime.submitted,
    }))
  );
  const submitting = guess.isPending && guess.variables.submit;
  const saveDraft = () => {
    if (!view.finished && !submitting) guess.mutate({ answers, submit: false });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        if (!view.finished) guess.mutate({ answers, submit: true });
      }}
    >
      <div className="daily-character-grid">
        {view.rounds.map((round, index) => (
          <CharacterRound
            key={index}
            day={view.day}
            index={index}
            round={round}
            suggestions={suggestions.data}
            checked={view.finished}
            disabled={submitting}
            value={answers[index]}
            onChange={(field, value) =>
              setAnswers((previous) =>
                previous.map((answer, i) => (i === index ? { ...answer, [field]: value } : answer))
              )
            }
            onBlur={saveDraft}
          />
        ))}
      </div>
      {guess.isError && (
        <p className="daily-form-error" role="alert">
          {t("collection.game.characters.guessError")}
        </p>
      )}
      {suggestions.isError && (
        <p className="daily-form-error" role="alert">
          {t("collection.game.characters.suggestionsError")}
        </p>
      )}
      <div className="daily-character-actions">
        {view.finished ? (
          <Button onClick={onResult}>{t("collection.game.result")}</Button>
        ) : (
          <Button type="submit" loading={submitting}>
            {t("collection.game.characters.submit")}
          </Button>
        )}
      </div>
    </form>
  );
}
