import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { DiagnosticProbe, DiagnosticRunResult } from "@/types/core/diagnostics";
import { ResultCell } from "@/routes/components/settings/diagnostics/resultCell.diagnostics";
import { ProxyAddress } from "@/routes/components/settings/diagnostics/proxyAddress.diagnostics";

export function ProxyCell({
  probe,
  result,
  configuredProxy,
  onConfigure,
}: {
  probe: DiagnosticProbe;
  result: DiagnosticRunResult | undefined;
  configuredProxy: string | null;
  onConfigure: (probe: DiagnosticProbe) => void;
}) {
  const { t } = useI18n();

  if (probe.proxy === "none") {
    return <span className="text-hint">{t("settings.diagnostics.proxy.notRequired")}</span>;
  }

  const proxy = result?.proxyUrl ?? configuredProxy;

  return (
    <div className="flex flex-col gap-0.5">
      {result ? (
        <ResultCell result={result} />
      ) : (
        <span className="text-hint">
          {configuredProxy
            ? t("settings.diagnostics.proxy.notChecked")
            : t("settings.diagnostics.proxy.absent")}
        </span>
      )}
      {proxy && <ProxyAddress value={proxy} />}
      {!configuredProxy && (
        <Button
          className="h-5 w-fit px-1.5 text-xs"
          variant="secondary"
          onClick={() => onConfigure(probe)}
        >
          {t("settings.diagnostics.action.configure")}
        </Button>
      )}
    </div>
  );
}
