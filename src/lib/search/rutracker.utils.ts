import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { RutrackerErrorCode } from "@/types/search";

const ERROR_KEYS: Record<RutrackerErrorCode, TranslationKey> = {
  wrong_credentials: "search.rutracker.err.wrong.credentials",
  blocked: "search.rutracker.err.blocked",
  network: "search.rutracker.err.network",
  login_failed: "search.rutracker.err.login.failed",
  session_failed: "search.rutracker.err.session.failed",
  cookies_invalid: "search.rutracker.err.cookies.invalid",
  cookies_parse: "search.rutracker.err.cookies.parse",
  webview_open: "search.rutracker.err.webview.open",
  webview_save: "search.rutracker.err.webview.save",
  webview_not_found: "search.rutracker.err.webview.not.found",
  no_cookies: "search.rutracker.err.no.cookies",
  no_session: "search.rutracker.err.no.session",
};

export function mapError(raw: string, t: (key: TranslationKey) => string): string {
  const code = raw.split(":")[0].trim() as RutrackerErrorCode;
  const label = t(ERROR_KEYS[code] ?? "search.rutracker.err.unknown");
  if (code === "network") {
    const detail = raw.split(":").slice(1).join(":").trim();
    if (detail) return `${label}\n${detail}`;
  }
  return label;
}
