import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { characterPortrait } from "@/api/characters.api";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { CharacterRound as Round, SubmittedAnswers } from "@/types/api/characters";

/** Both text fields stay editable until the single sheet submission. */
export default function CharacterRound({
  day,
  index,
  round,
  value,
  checked,
  disabled,
  onChange,
  onBlur,
}: {
  day: string;
  index: number;
  round: Round;
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
          <label className="sr-only" htmlFor={`character-${index}-${kind}`}>
            {t(
              kind === "character"
                ? "collection.game.characters.input"
                : "collection.game.characters.animeInput"
            )}
          </label>
          <Input
            id={`character-${index}-${kind}`}
            placeholder={t(
              kind === "character"
                ? "collection.game.characters.input"
                : "collection.game.characters.animeInput"
            )}
            value={checked ? round[kind].submitted : value[kind]}
            readOnly={checked}
            aria-invalid={checked && !round[kind].solved}
            aria-description={
              checked
                ? t(
                    round[kind].solved
                      ? "collection.game.characters.correct"
                      : "collection.game.characters.wrong"
                  )
                : undefined
            }
            disabled={disabled}
            maxLength={160}
            onChange={(e) => onChange(kind, e.target.value)}
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
