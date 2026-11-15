import type { RuDictionary } from "@/lib/locale/ru";

export type Locale = "ru";

export type TranslationVariables = Record<string, string | number>;

export type TranslationKey = keyof RuDictionary;

export type TFunc = (key: TranslationKey, variables?: TranslationVariables) => string;
