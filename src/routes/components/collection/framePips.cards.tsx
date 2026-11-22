import { useI18n } from "@/hooks/i18n.hook";
import { MAX_DAILY_FRAMES } from "@/config/cards/daily.config";
import type { DailyResultView } from "@/types/api/daily";
import type { TranslationKey } from "@/types/core/i18n";

export function FramePips({
  attempts,
  result,
  total = MAX_DAILY_FRAMES,
  selected = null,
  onSelect,
  openLabelKey = "collection.game.frames.open",
}: {
  attempts: number;
  result: DailyResultView | null;
  total?: number;
  selected?: number | null;
  onSelect?: (slot: number) => void;
  openLabelKey?: TranslationKey;
}) {
  const { t } = useI18n();
  const interactive = onSelect !== undefined && result === null;

  return (
    <div className="daily-pips" aria-hidden={!interactive}>
      {Array.from({ length: total }, (_, index) => {
        const state =
          result !== null
            ? index < result.attempts - 1
              ? "done"
              : index === result.attempts - 1
                ? result.won
                  ? "correct"
                  : "wrong"
                : "future"
            : index < attempts
              ? "done"
              : index === attempts
                ? "current"
                : "future";

        if (!interactive) {
          return (
            <span key={index} className="daily-pip" data-state={state}>
              {index + 1}
            </span>
          );
        }

        return (
          <button
            key={index}
            type="button"
            className="daily-pip"
            data-state={state}
            data-selected={index === (selected ?? attempts)}
            disabled={index > attempts}
            title={t(openLabelKey, { slot: index + 1 })}
            aria-label={t(openLabelKey, { slot: index + 1 })}
            aria-pressed={index === (selected ?? attempts)}
            onClick={() => onSelect?.(index)}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}
