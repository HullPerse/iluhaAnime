import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { DiagnosticFinding } from "@/types/core/diagnostics";
import { STATUS_KEY, FINDING_TITLE, FINDING_DETAIL } from "@/config/diagnostics/display.config";

export function FindingRow({
  finding,
  onJump,
}: {
  finding: DiagnosticFinding;
  onJump: (finding: DiagnosticFinding) => void;
}) {
  const { t } = useI18n();
  const variables = {
    direct: t(STATUS_KEY[finding.directStatus]),
    proxy:
      finding.proxyStatus === null
        ? t("settings.diagnostics.status.skipped")
        : t(STATUS_KEY[finding.proxyStatus]),
    directMs: finding.directLatencyMs ?? "-",
    proxyMs: finding.proxyLatencyMs ?? "-",
  };
  const tone =
    finding.severity === "error"
      ? "text-destructive"
      : finding.severity === "warning"
        ? "text-highlight"
        : "text-hint";

  return (
    <div className="bg-field windows95-border flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1">
      <span className={`text-xs font-bold ${tone}`}>{t(FINDING_TITLE[finding.code])}</span>
      <span className="text-hint text-xs">{t(finding.probeLabelKey)}</span>
      <p className="text-hint min-w-0 flex-1 text-xs">
        {t(FINDING_DETAIL[finding.code], variables)}
      </p>
      {finding.action !== "none" && (
        <Button className="h-5 px-1.5 text-xs" variant="secondary" onClick={() => onJump(finding)}>
          {finding.action === "openProxy"
            ? t("settings.diagnostics.action.openProxy")
            : t("settings.diagnostics.action.openZapret")}
        </Button>
      )}
    </div>
  );
}
