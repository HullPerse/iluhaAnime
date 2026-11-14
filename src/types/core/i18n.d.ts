import type { RuDictionary } from "@/lib/locale/ru";

export type Locale = "ru" | "en";

export type TranslationVariables = Record<string, string | number>;

export type TranslationKey = keyof RuDictionary;

export type TFunc = (key: TranslationKey, variables?: TranslationVariables) => string;
