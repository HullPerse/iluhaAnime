import type { TranslationKey } from "@/types/core/i18n";

export function toLocaleKey(value: string): TranslationKey {
  return value as TranslationKey;
}
