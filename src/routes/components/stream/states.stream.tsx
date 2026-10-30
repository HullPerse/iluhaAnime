import { AlertTriangle, Ban, Inbox, RotateCw, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

/**
 * The state surfaces of the streaming tab. They all live in the same beveled
 * panel the results grid uses, so a failure does not replace the tab with a
 * centered line of text.
 */

function StatePanel({
  icon,
  title,
  description,
  action,
  alert = false,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  alert?: boolean;
}) {
  return (
    <section
      className="windows95-border bg-primary flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 p-6"
      role={alert ? "alert" : "status"}
    >
      {icon}
      <span className="windows95-text text-sm font-bold">{title}</span>
      {description ? (
        <span className="text-hint windows95-text max-h-40 max-w-xl overflow-y-auto text-center break-words whitespace-pre-wrap">
          {description}
        </span>
      ) : null}
      {action}
    </section>
  );
}

export function StreamLoadingGrid({ count = 12 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <section
      className="windows95-border bg-field min-h-0 w-full flex-1 overflow-hidden p-1"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{t("stream.loading")}</span>
      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))] content-start gap-2">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            aria-hidden
            className="windows95-active-border bg-field flex flex-col overflow-hidden"
          >
            <span className="bg-surface block aspect-3/4 w-full animate-pulse" />
            <span className="bg-primary flex h-9 flex-col justify-center gap-1 px-1">
              <span className="bg-surface block h-2 w-3/4 animate-pulse" />
              <span className="bg-surface block h-2 w-1/2 animate-pulse" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StreamEmpty({ message, action }: { message?: string; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <StatePanel
      icon={<Inbox className="text-hint size-8" aria-hidden />}
      title={message ?? t("stream.noResults")}
      action={action}
    />
  );
}

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

export function StreamOffline() {
  const { t } = useI18n();
  return (
    <StatePanel
      icon={<WifiOff className="text-hint size-8" aria-hidden />}
      title={t("stream.offline.title")}
      description={t("stream.offline.body")}
    />
  );
}

export function StreamDisabled() {
  const { t } = useI18n();
  return (
    <StatePanel
      icon={<Ban className="text-hint size-8" aria-hidden />}
      title={t("app.stream")}
      description={t("stream.tabDisabled")}
    />
  );
}

export function StreamInlineLoading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <span className="text-hint windows95-text flex items-center justify-center gap-1 p-2">
      <SmallLoader size={3} />
      {label ?? t("stream.loading")}
    </span>
  );
}
