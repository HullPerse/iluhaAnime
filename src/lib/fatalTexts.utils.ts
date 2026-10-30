import { translate } from "@/lib/locale/i18n.utils";
import { attemptSync } from "@/lib/attempt.utils";
import type { FatalInfo, FatalTexts } from "@/types/fatal";
import type { Locale, TranslationKey } from "@/types/i18n";
import type { DbTexts, SplashTexts } from "@/types/fatalTexts";

export function resolveFatalLocale(): Locale {
  if (typeof localStorage === "undefined") return "en";
  const [raw, readError] = attemptSync(() => localStorage.getItem("iluha.v1.settings"));
  if (readError !== null || !raw) return "en";
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || typeof parsed !== "object" || parsed === null) return "en";
  const envelope = parsed as { data?: unknown };
  const data = envelope.data;
  if (typeof data !== "object" || data === null) return "en";
  const language = (data as { language?: unknown }).language;
  return language === "ru" ? "ru" : "en";
}

export function resolveFatalTexts(locale: Locale, kind: FatalInfo["kind"]): FatalTexts {
  const pick = (key: TranslationKey): string => translate(locale, key);
  return {
    kindLabel: pick(`fatal.kind.${kind}` as TranslationKey),
    yorhaBanner: pick("fatal.yorha.banner"),
    hint: pick("fatal.hint"),
    details: pick("fatal.details"),
    copy: pick("fatal.copy"),
    copied: pick("fatal.copied"),
    reload: pick("fatal.reload"),
    safeReload: pick("fatal.safeReload"),
    retry: pick("fatal.retry"),
    retryUsed: pick("fatal.retryUsed"),
    safeNote: pick("fatal.safeNote"),
  };
}

export function resolveSplashTexts(locale: Locale): SplashTexts {
  const pick = (key: TranslationKey): string => translate(locale, key);
  return {
    theme: pick("splash.stage.theme"),
    migrations: pick("splash.stage.migrations"),
    cache: pick("splash.stage.cache"),
    database: pick("splash.stage.database"),
    tabs: pick("splash.stage.tabs"),
    spelling: pick("splash.stage.spelling"),
    index: pick("splash.stage.index"),
    loading: pick("splash.loading"),
    fastLaunch: pick("splash.fastLaunch"),
    yorhaTitle: pick("splash.yorha.title"),
    yorhaTagline: pick("splash.yorha.tagline"),
    xpBrand: pick("splash.xp.brand"),
    xpCopyright: pick("splash.xp.copyright"),
    win7Brand: pick("splash.win7.brand"),
    win7Copyright: pick("splash.win7.copyright"),
  };
}

export function resolveDbTexts(locale: Locale): DbTexts {
  const pick = (key: TranslationKey): string => translate(locale, key);
  return {
    title: pick("db.title"),
    hint: pick("db.hint"),
    details: pick("db.details"),
    retry: pick("db.retry"),
    reload: pick("db.reload"),
    copy: pick("db.copy"),
    copied: pick("db.copied"),
    openFolder: pick("db.openFolder"),
  };
}
