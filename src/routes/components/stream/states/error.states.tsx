import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

import { StatePanel } from "@/routes/components/stream/states/panel.states";

export function StreamError({
  title,
  message,
  detail,
  onRetry,
}: {
  title?: string;
  message?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <StatePanel
      alert
      icon={<AlertTriangle className="text-destructive size-8" aria-hidden />}
      title={title ?? t("stream.error.title")}
      description={[message, detail].filter(Boolean).join("\n") || undefined}
      action={
        onRetry ? (
          <Button
            size="icon"
            title={t("stream.retry")}
            aria-label={t("stream.retry")}
            onClick={onRetry}
          >
            <RotateCw className="size-4" />
          </Button>
        ) : undefined
      }
    />
  );
}
