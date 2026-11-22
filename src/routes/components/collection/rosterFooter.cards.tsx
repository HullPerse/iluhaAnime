import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export default function RosterFooter({
  hasMore,
  failed,
  loading,
  disabled,
  onRetry,
  onMore,
}: {
  hasMore: boolean;
  failed: boolean;
  loading: boolean;
  disabled: boolean;
  onRetry: () => void;
  onMore: () => void;
}) {
  const { t } = useI18n();

  if (!hasMore) return null;

  if (failed) {
    return (
      <div className="mt-2 flex flex-col items-center gap-1">
        <span className="windows95-text text-destructive" role="alert">
          {t("collection.error")}
        </span>
        <Button className="h-6 px-2 text-xs" onClick={onRetry}>
          {t("collection.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      {loading && (
        <span className="windows95-text text-hint" role="status">
          {t("collection.collection.roster.loading")}
        </span>
      )}
      <Button className="h-6 px-2 text-xs" disabled={disabled} onClick={onMore}>
        {t("collection.collection.roster.more")}
      </Button>
    </div>
  );
}
