import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function ImportFooter({
  canImport,
  importing,
  importLabel,
  showRetry,
  onCancel,
  onRetry,
  onImport,
}: {
  canImport: boolean;
  importing: boolean;
  importLabel: string;
  showRetry: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onImport: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex justify-end gap-2">
      <Button variant="default" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button rendered={showRetry} onClick={onRetry}>
        {t("collection.import.anilist.retry.failed")}
      </Button>
      <Button onClick={onImport} disabled={!canImport} loading={importing}>
        {importLabel}
      </Button>
    </div>
  );
}
