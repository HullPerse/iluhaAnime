import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";

import { Button } from "../ui/button.component";
import { SmallLoader } from "./loader.component";

export function EmptyState({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="ui-empty-state windows95-text">
      {icon}
      <span>{children}</span>
    </section>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <section className="ui-empty-state windows95-text">
      <SmallLoader />
      <span>{label ?? t("common.loading")}</span>
    </section>
  );
}

export function RetryState({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-empty-state windows95-text flex-col">
      <span>{children}</span>
      <Button onClick={onRetry}>
        <RotateCcw className="size-3" />
        {t("common.continue")}
      </Button>
    </section>
  );
}
