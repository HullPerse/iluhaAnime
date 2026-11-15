import { DAILY_HINT_KEYS } from "@/config/cards/daily.config";
import type { DailyHintView } from "@/types/api/daily";
import type { TranslationKey } from "@/types/core/i18n";

export function hintLabelFor(frame: DailyHintView, t: (key: TranslationKey) => string): string {
  const label = t(DAILY_HINT_KEYS[frame.hintKind] ?? "collection.game.hint.info");
  return `${label}: ${frame.hintValue}`;
}
