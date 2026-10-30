import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n } from "@/hooks/i18n.hook";

import { StatePanel } from "@/routes/components/stream/states/panel.states";

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
