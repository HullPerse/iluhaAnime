import { useMemo } from "react";

import en from "@/lib/locale/en";
import ru from "@/lib/locale/ru";
import { useSettingsStore } from "@/store/settings.store";
import type { Locale, TranslationKey, TranslationVariables } from "@/types/i18n";

export type { Locale, TranslationVariables };
export type { TranslationKey };

const dictionaries: Record<Locale, Record<string, string>> = { en, ru };

function repairLegacyCyrillic(value: string): string {
  if (!/[РС]/u.test(value)) return value;
  const legacyDecoder = new TextDecoder("windows-1251");
  const reverseCodePage = new Map<string, number>();
  for (let byte = 0; byte <= 0xff; byte++) {
    reverseCodePage.set(legacyDecoder.decode(new Uint8Array([byte])), byte);
  }
  const bytes = new Uint8Array(
    Array.from(
      value,
      (character) => reverseCodePage.get(character) ?? character.codePointAt(0) ?? 0x3f
    )
  );
  const repaired = new TextDecoder("utf-8").decode(bytes);
  return repaired.includes("\uFFFD") ? value : repaired;
}

function resolvePluralKey(locale: Locale, key: string, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  if (category === "other") return key;
  const suffixed = `${key}.${category}`;
  if (suffixed in dictionaries[locale]) return suffixed;
  if (locale !== "ru" && suffixed in dictionaries.ru) return suffixed;
  return key;
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  variables?: TranslationVariables
): string {
  const safeLocale = locale === "en" ? "en" : "ru";
  const resolvedKey =
    variables && typeof variables.count === "number"
      ? resolvePluralKey(safeLocale, key, variables.count)
      : key;
  const template = repairLegacyCyrillic(
    dictionaries[safeLocale][resolvedKey as TranslationKey] ??
      dictionaries.ru[resolvedKey as TranslationKey] ??
      key
  );
  return variables
    ? template.replaceAll(/\{\{(\w+)\}\}/gu, (_match: string, name: string) =>
        String(variables[name] ?? `{{${name}}}`)
      )
    : template;
}

export function useI18n() {
  const locale = useSettingsStore((state) => state.language);
  return useMemo(
    () => ({
      locale,
      t: (key: TranslationKey, variables?: TranslationVariables) =>
        translate(locale, key, variables),
    }),
    [locale]
  );
}
