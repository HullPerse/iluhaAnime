import { useMemo } from "react";

import en from "@/i18n/locales/en";
import ru from "@/i18n/locales/ru";
import { useSettingsStore } from "@/store/settings.store";
import type { Locale, TranslationVariables } from "@/types";

const dictionaries: Record<Locale, Record<string, string>> = { en, ru };
export type TranslationKey = keyof typeof ru;

// Some older generated locale files may contain UTF-8 text decoded as
// Windows-1251. Repair that representation at the boundary so persisted or
// cached locale data cannot turn the interface into mojibake.
function repairLegacyCyrillic(value: string): string {
  if (!/[РС]/u.test(value)) return value;
  const legacyDecoder = new TextDecoder("windows-1251");
  const reverseCodePage = new Map<string, number>();
  for (let byte = 0; byte <= 0xff; byte++) {
    reverseCodePage.set(
      legacyDecoder.decode(new Uint8Array([byte])),
      byte
    );
  }
  const bytes = new Uint8Array(
    Array.from(value, (character) =>
      reverseCodePage.get(character) ?? character.codePointAt(0) ?? 0x3f
    )
  );
  const repaired = new TextDecoder("utf-8").decode(bytes);
  // A real Cyrillic string is not valid UTF-8 when treated as a legacy
  // single-byte code page and therefore decodes with replacement characters.
  // Mojibake such as `РЎРµ...` round-trips cleanly and can be repaired.
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
