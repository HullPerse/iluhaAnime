import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

/** Shared waiting and failure blocks for the overlay screens. */
export function DetailLoading() {
  return (
    <div className="flex items-center justify-center py-6">
      <SmallLoader size={5} />
    </div>
  );
}

export function DetailError({
  message,
  onRetry,
}: {
  /** The engine's own text when there is one, else the generic load error. */
  message?: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 p-4">
      <span className="windows95-text text-destructive text-center text-xs">
        {message ?? t("anilist.details.load.error")}
      </span>
      <Button onClick={onRetry}>{t("anilist.details.retry")}</Button>
    </div>
  );
}
