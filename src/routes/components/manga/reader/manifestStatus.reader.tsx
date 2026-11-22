import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { readerButton } from "@/routes/components/manga/reader/chrome.reader";

export function ReaderManifestStatus({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => Promise<unknown>;
}) {
  const { t } = useI18n();

  return (
    <div
      className="absolute inset-0 grid place-content-center gap-2"
      role={failed ? "alert" : "status"}
    >
      {t(failed ? "manga.reader.pageFailed" : "manga.reader.pageLoading")}
      {failed && (
        <Button variant="ghost" className={readerButton} onClick={onRetry}>
          {t("manga.search.retry")}
        </Button>
      )}
    </div>
  );
}
