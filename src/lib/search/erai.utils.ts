import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { EraiErrorCode } from "@/types/search";

const ERROR_KEYS: Record<EraiErrorCode, TranslationKey> = {
  webview_open: "search.erai.err.webview.open",
  webview_save: "search.erai.err.webview.save",
  webview_not_found: "search.erai.err.webview.not.found",
  no_session: "search.erai.err.no.session",
  network: "search.erai.err.network",
};

export function mapError(raw: string, t: (key: TranslationKey) => string): string {
  const code = raw.split(":")[0].trim() as EraiErrorCode;
  return t(ERROR_KEYS[code] ?? "search.erai.err.unknown");
}
