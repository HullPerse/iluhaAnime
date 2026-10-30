import { WifiOff } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";

import { StatePanel } from "@/routes/components/stream/states/panel.states";

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
