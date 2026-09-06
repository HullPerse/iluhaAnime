import { useMemo } from "react";

import en from "@/lib/locale/en";
import ru from "@/lib/locale/ru";
import { useSettingsStore } from "@/store/settings.store";
import type { Locale, TranslationVariables } from "@/types";
import type { TranslationKey } from "@/types/i18n";

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

export function translate(
  locale: Locale,
  key: TranslationKey,
  variables?: TranslationVariables
): string {
  const safeLocale = locale === "en" ? "en" : "ru";
  const template = repairLegacyCyrillic(
    dictionaries[safeLocale][key] ?? dictionaries.ru[key] ?? key
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
