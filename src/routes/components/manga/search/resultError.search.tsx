import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { ipcErrorCode } from "@/lib/core/system/ipcError.utils";
import { MangaState } from "@/routes/components/manga/state.manga";

export function SearchResultError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const code = ipcErrorCode(error);
  const errorText =
    code === "Blocked"
      ? t("manga.search.blocked")
      : code === "RateLimited"
        ? t("manga.search.rateLimited")
        : t("manga.search.failed");

  return (
    <MangaState kind="error">
      <span>{errorText}</span>
      {code === "Blocked" && (
        <Button
          onClick={async () => {
            await navigate({
              to: "/settings",
              search: { tab: "proxy", section: "proxy.manga" },
            });
          }}
        >
          {t("manga.sources.proxySettings")}
        </Button>
      )}
      <Button
        onClick={async () => {
          await onRetry();
        }}
      >
        {t("manga.search.retry")}
      </Button>
    </MangaState>
  );
}
