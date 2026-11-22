import { zapretLocalEndpoint } from "@/config/settings/zapret.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";
import { CopyButton } from "@/routes/components/settings/zapret/copyButton.zapret";

export function LocalEndpoint() {
  const { t } = useI18n();
  const port = useCell(settingsAtoms.httpApiPort);
  const value = zapretLocalEndpoint(port);

  return (
    <section className="ui-panel" data-find-section="zapret.local">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.zapret.local.title")}</span>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-field windows95-border px-2 py-1 font-mono text-xs">{value}</code>
          <CopyButton value={value} />
        </div>
      </div>
    </section>
  );
}
