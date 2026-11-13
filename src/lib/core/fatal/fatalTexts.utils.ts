import { translate } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { FatalInfo, FatalTexts } from "@/types/core/fatal";
import type { TranslationKey } from "@/types/core/i18n";
import type { DbTexts, SplashTexts } from "@/types/core/fatalTexts";

export function resolveFatalTexts(kind: FatalInfo["kind"]): FatalTexts {
  const pick = (key: TranslationKey): string => translate(key);
  return {
    kindLabel: pick(toLocaleKey(`fatal.kind.${kind}`)),
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
    checkUpdate: pick("fatal.checkUpdate"),
    checkingUpdate: pick("fatal.checkingUpdate"),
    installingUpdate: pick("fatal.installingUpdate"),
    updateLatest: pick("fatal.updateLatest"),
    updateFailed: pick("fatal.updateFailed"),
  };
}

export function resolveSplashTexts(): SplashTexts {
  const pick = (key: TranslationKey): string => translate(key);
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

export function resolveDbTexts(): DbTexts {
  const pick = (key: TranslationKey): string => translate(key);
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
