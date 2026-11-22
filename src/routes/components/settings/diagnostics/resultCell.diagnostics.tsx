import { useI18n } from "@/hooks/i18n.hook";
import { probeStatus } from "@/lib/core/diagnostics/analyze.utils";
import type { DiagnosticRunResult } from "@/types/core/diagnostics";
import { STATUS_KEY, STATUS_CLASS } from "@/config/diagnostics/display.config";

export function ResultCell({ result }: { result: DiagnosticRunResult | undefined }) {
  const { t } = useI18n();

  if (!result) return <span className="text-hint">-</span>;
  const status = probeStatus(result);
  const latency = result.diagnosis?.https.latencyMs;
  const label = t(STATUS_KEY[status]);

  return (
    <span className={STATUS_CLASS[status]} title={result.error ?? undefined}>
      {latency === undefined
        ? label
        : t("settings.diagnostics.status.latency", { status: label, latency })}
    </span>
  );
}
