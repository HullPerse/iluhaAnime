import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function DetailsError({
  error,
  onRetry,
  onOpenOriginal,
}: {
  error: string;
  onRetry: () => void;
  onOpenOriginal: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="text-destructive flex min-h-36 flex-col items-center justify-center gap-2">
      <AlertCircle className="size-7" />
      <span className="windows95-text max-w-2xl text-center whitespace-pre-wrap">{error}</span>
      <div className="flex flex-wrap justify-center gap-1">
        <Button onClick={onRetry}>
          <RefreshCw className="mr-1 size-3" />
          {t("search.details.retry")}
        </Button>
        <Button onClick={onOpenOriginal}>
          <ExternalLink className="mr-1 size-3" />
          {t("search.details.original")}
        </Button>
      </div>
    </div>
  );
}
