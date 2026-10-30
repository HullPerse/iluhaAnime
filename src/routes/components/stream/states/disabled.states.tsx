import { Ban } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";

import { StatePanel } from "@/routes/components/stream/states/panel.states";

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
