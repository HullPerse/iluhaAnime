import type { TFunc } from "@/types/core/i18n";

export function detailErrorText(error: unknown, isLoggedIn: boolean, t: TFunc): string {
  const raw = String(error ?? "");
  if (!isLoggedIn && /403/.test(raw)) return t("anilist.details.login.required");
  if (/404|Not Found/i.test(raw)) return t("anilist.details.unavailable");
  return String(error ?? t("anilist.details.load.error"));
}
