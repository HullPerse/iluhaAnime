import { Button } from "@/components/ui/button.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { characterPortrait } from "@/api/characters.api";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { settingsAtoms } from "@/store/settings.store";
import CharacterGuessField from "@/routes/components/collection/characterGuessField.cards";
import type {
  CharacterIndexEntry,
  CharacterRound as Round,
  CharactersSearchIndex,
  SubmittedAnswers,
} from "@/types/api/characters";

const NO_ENTRIES: CharacterIndexEntry[] = [];

/** Both dropdown fields stay editable until the single sheet submission. */
export default function CharacterRound({
  day,
  index,
  round,
  suggestions,
  value,
  checked,
  disabled,
  onChange,
  onBlur,
}: {
  day: string;
  index: number;
  round: Round;
  suggestions: CharactersSearchIndex | undefined;
  value: SubmittedAnswers;
  checked: boolean;
  disabled: boolean;
  onChange: (field: keyof SubmittedAnswers, value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useI18n();
  const portrait = useAppQuery("static", {
    queryKey: ["daily-character-portrait", day, index],
    queryFn: () =>
      characterPortrait(day, index, effectiveProxyUrl(null, settingsAtoms.anilistProxyUrl.get())),
    retry: false,
    gcTime: 60_000,
  });

  return (
    <article className="daily-character-round">
      {portrait.data && (
        <img
          className="daily-character-portrait windows95-border"
          src={portrait.data}
          alt={t("collection.game.characters.portrait")}
        />
      )}
      {portrait.isPending && <p role="status">{t("collection.game.state.pending")}</p>}
      {portrait.isError && (
        <div role="alert">
          <p>{t("collection.game.characters.imageError")}</p>
          <Button onClick={() => ignore(portrait.refetch())}>{t("collection.retry")}</Button>
        </div>
      )}
      {(["character", "anime"] as const).map((kind) => (
        <div
          className="daily-character-answer"
          key={kind}
          data-correct={checked ? round[kind].solved : undefined}
        >
          <CharacterGuessField
            id={`character-${index}-${kind}`}
            label={t(
              kind === "character"
                ? "collection.game.characters.input"
                : "collection.game.characters.animeInput"
            )}
            value={checked ? round[kind].submitted : value[kind]}
            entries={
              kind === "character"
                ? (suggestions?.characters ?? NO_ENTRIES)
                : (suggestions?.anime ?? NO_ENTRIES)
            }
            checked={checked}
            solved={round[kind].solved}
            disabled={disabled}
            onValueChange={(next) => onChange(kind, next)}
            onBlur={onBlur}
          />
          {checked && (
            <>
              <strong>{round[kind].answer}</strong>
            </>
          )}
        </div>
      ))}
    </article>
  );
}
