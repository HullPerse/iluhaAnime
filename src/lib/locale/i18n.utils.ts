import ru from "@/lib/locale/ru";
import { settingsAtoms } from "@/store/settings.store";
import type { Locale, TranslationKey, TranslationVariables } from "@/types/core/i18n";

export type { Locale, TranslationVariables };
export type { TranslationKey };

const RU_DICTIONARY: Record<string, string> = ru;
const dictionaries: Partial<Record<Locale, Record<string, string>>> = { ru };
const PLURAL_RULES: Record<Locale, Intl.PluralRules> = {
  ru: new Intl.PluralRules("ru"),
  en: new Intl.PluralRules("en"),
};

export function registerLocale(locale: Locale, dictionary: Record<string, string>): void {
  dictionaries[locale] = dictionary;
}

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
  if (repaired.includes("\uFFFD")) return value;
  return repaired;
}

function resolvePluralKey(
  locale: Locale,
  dictionary: Record<string, string>,
  key: string,
  count: number
): string {
  const category = PLURAL_RULES[locale].select(count);
  if (category === "other") return key;
  const suffixed = `${key}.${category}`;
  return suffixed in dictionary ? suffixed : key;
}

export function translateFor(
  locale: Locale,
  key: TranslationKey,
  variables?: TranslationVariables
): string {
  const dictionary = dictionaries[locale] ?? RU_DICTIONARY;
  const resolvedKey =
    variables && typeof variables.count === "number"
      ? resolvePluralKey(locale, dictionary, key, variables.count)
      : key;
  const template = repairLegacyCyrillic(dictionary[resolvedKey] ?? key);

  if (!variables) return template;

  return template.replaceAll(/\{\{(\w+)\}\}/gu, (_match: string, name: string) =>
    String(variables[name] ?? `{{${name}}}`)
  );
}

export function translate(key: TranslationKey, variables?: TranslationVariables): string {
  return translateFor(settingsAtoms.language.get(), key, variables);
}

export function tr(key: TranslationKey, vars?: TranslationVariables): string {
  return translate(key, vars);
}
