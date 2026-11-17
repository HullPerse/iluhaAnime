import { probeStatus } from "@/lib/core/diagnostics/analyze.utils";
import type { DiagnosticReport, DiagnosticRunResult } from "@/types/core/diagnostics";

export function redactProxyUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (url.username !== "") url.username = "***";
    if (url.password !== "") url.password = "***";
    return url.toString();
  } catch {
    return value.replace(/\/\/[^@/]*@/u, "//***@");
  }
}

export function formatDiagnosticReport(
  report: DiagnosticReport,
  results: readonly DiagnosticRunResult[]
): string {
  const lines = [
    "# iluhaAnime network diagnostics",
    `generated: ${new Date().toISOString()}`,
    `probes: ${report.summary.total}, ok: ${report.summary.ok}, warnings: ${report.summary.warnings}, errors: ${report.summary.errors}, skipped: ${report.summary.skipped}`,
    "",
    "## findings",
  ];

  if (report.findings.length === 0) {
    lines.push("none");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `- [${finding.severity}] ${finding.code} ${finding.probeId} direct=${finding.directStatus} proxy=${finding.proxyStatus ?? "not-run"} confidence=${finding.confidence}`
      );
    }
  }

  lines.push("", "## probes");
  for (const result of results) {
    if (result.diagnosis === null) {
      lines.push(
        `- ${result.probe.id} [${result.mode}] ${result.probe.url} -> ${probeStatus(result)} error=${result.error ?? "unknown"}`
      );
      continue;
    }
    const diagnosis = result.diagnosis;
    const status = diagnosis.https.status === null ? "-" : String(diagnosis.https.status);
    lines.push(
      `- ${result.probe.id} [${result.mode}] ${result.probe.url} -> ${probeStatus(result)} verdict=${diagnosis.verdict} http=${status} ${diagnosis.https.latencyMs}ms proxy=${redactProxyUrl(result.proxyUrl) ?? "none"}`
    );
  }

  return lines.join("\n");
}
