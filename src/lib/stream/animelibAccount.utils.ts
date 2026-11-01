import type { TranslationKey, TranslationVariables } from "@/types/core/i18n";
import type { AnimeLibAccount } from "@/types/api/stream";

export function animelibAccountLabel(
  account: AnimeLibAccount | null,
  t: (key: TranslationKey, variables?: TranslationVariables) => string
): string {
  if (account === null) return t("settings.animelib.account.loading");
  if (account.login !== null) return t("settings.animelib.account.login", { login: account.login });
  if (account.tokenSaved) return t("settings.animelib.account.invalid");
  return t("settings.animelib.account.none");
}
