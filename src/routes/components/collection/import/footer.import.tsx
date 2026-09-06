import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

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
      {showRetry && (
        <Button onClick={onRetry}>{t("collection.import.anilist.retry.failed")}</Button>
      )}
      <Button onClick={onImport} disabled={!canImport || importing}>
        {importing ? t("common.loading") : importLabel}
      </Button>
    </div>
  );
}
