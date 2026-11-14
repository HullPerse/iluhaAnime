import { Check, X } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";
import type { GuessHistoryItem } from "@/types/ui/daily";

export function GuessHistory({ history }: { history: GuessHistoryItem[] }) {
  const { t } = useI18n();
  if (history.length === 0) return null;

  return (
    <div className="daily-guess-history">
      {history.toReversed().map((item, index) => {
        const state = item.correct ? "correct" : item.franchise ? "franchise" : "wrong";
        return (
          <div
            key={`${item.media.id}:${history.length - index}`}
            className="windows95-small-border daily-guess-row"
            data-state={state}
            title={t(
              item.correct
                ? "collection.game.correct"
                : item.franchise
                  ? "collection.game.franchise"
                  : "collection.game.wrong"
            )}
          >
            <span className="daily-guess-mark">
              {item.correct ? (
                <Check className="size-3.5" />
              ) : item.franchise ? (
                <span className="daily-franchise-dot" />
              ) : (
                <X className="size-3.5" />
              )}
            </span>
            <span className="daily-guess-title">{item.media.title}</span>
          </div>
        );
      })}
    </div>
  );
}
