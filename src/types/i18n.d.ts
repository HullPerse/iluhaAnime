import type ru from "@/lib/locale/ru";

export type Locale = "ru" | "en";

export type TranslationVariables = Record<string, string | number>;

export type TranslationKey = keyof typeof ru;

export type TFunc = (key: TranslationKey, variables?: TranslationVariables) => string;
