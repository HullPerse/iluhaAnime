import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

export default function SearchErrorBar({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <section
      className="windows95-border bg-surface text-destructive flex items-center gap-2 px-2 py-1"
      role="alert"
    >
      <AlertCircle className="size-4 shrink-0" />
      <span className="windows95-text flex-1 truncate">
        {error instanceof Error ? error.message : String(error ?? t("search.error"))}
      </span>
      <Button className="h-5" onClick={onRetry}>
        {t("search.retry")}
      </Button>
    </section>
  );
}
