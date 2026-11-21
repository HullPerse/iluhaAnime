import type {
  DiagnosticFinding,
  DiagnosticReport,
  DiagnosticRunResult,
  DiagnosticStatus,
  DiagnosticSummary,
} from "@/types/core/diagnostics";

const SLOW_MS = 2000;
const COMPARE_MIN_MS = 300;
const COMPARE_RATIO = 0.25;

interface GroupedProbe {
  direct?: DiagnosticRunResult;
  proxy?: DiagnosticRunResult;
}

type FindingBase = Pick<
  DiagnosticFinding,
  | "group"
  | "probeId"
  | "probeLabelKey"
  | "directStatus"
  | "proxyStatus"
  | "directLatencyMs"
  | "proxyLatencyMs"
>;

interface ProbeVerdict {
  findings: DiagnosticFinding[];
  ok: boolean;
  skipped: boolean;
}

function isOk(status: DiagnosticStatus): boolean {
  return status === "ok" || status === "slow";
}

export function probeStatus(result: DiagnosticRunResult): DiagnosticStatus {
  if (result.error !== null) {
    return result.mode === "proxy" ? "proxy" : "error";
  }
  const diagnosis = result.diagnosis;
  if (diagnosis === null) return "skipped";

  switch (diagnosis.verdict) {
    case "ok": {
      return diagnosis.https.latencyMs >= SLOW_MS ? "slow" : "ok";
    }
    case "dns_failed": {
      return "dns";
    }
    case "tcp_failed": {
      return "tcp";
    }
    case "tls_failed": {
      return "tls";
    }
    case "http_status": {
      return diagnosis.https.status === 401 || diagnosis.https.status === 403
        ? "auth"
        : "http";
    }
    case "anti_bot": {
      return "antibot";
    }
    case "request_failed": {
      const error = diagnosis.https.error?.toLowerCase() ?? "";
      return error.includes("timeout") || error.includes("timed out") ? "timeout" : "error";
    }
    default: {
      return "error";
    }
  }
}

function latencyOf(result: DiagnosticRunResult | undefined): number | null {
  return result?.diagnosis?.https.latencyMs ?? null;
}

function fasterBy(base: number, candidate: number): boolean {
  const delta = base - candidate;
  return delta >= COMPARE_MIN_MS && delta >= base * COMPARE_RATIO;
}

function makeFinding(
  base: FindingBase,
  suffix: string,
  code: DiagnosticFinding["code"],
  severity: DiagnosticFinding["severity"],
  action: DiagnosticFinding["action"],
  confidence: DiagnosticFinding["confidence"]
): DiagnosticFinding {
  return {
    ...base,
    id: `${base.probeId}:${suffix}`,
    code,
    severity,
    action,
    confidence,
  };
}

function oneFinding(
  base: FindingBase,
  suffix: string,
  code: DiagnosticFinding["code"],
  severity: DiagnosticFinding["severity"],
  action: DiagnosticFinding["action"],
  confidence: DiagnosticFinding["confidence"]
): ProbeVerdict {
  return {
    findings: [makeFinding(base, suffix, code, severity, action, confidence)],
    ok: false,
    skipped: false,
  };
}

function speedFinding(
  base: FindingBase,
  proxyConfigured: boolean
): DiagnosticFinding | null {
  if (base.directLatencyMs === null || base.proxyLatencyMs === null) return null;
  if (fasterBy(base.directLatencyMs, base.proxyLatencyMs)) {
    if (proxyConfigured) return null;
    return makeFinding(base, "proxy-faster", "proxy_faster", "info", "openProxy", "medium");
  }
  if (fasterBy(base.proxyLatencyMs, base.directLatencyMs)) {
    return makeFinding(base, "direct-faster", "direct_faster", "info", "none", "medium");
  }
  return null;
}

function evaluateWithProxy(base: FindingBase, proxyConfigured: boolean): ProbeVerdict {
  const directOk = isOk(base.directStatus);
  const proxyOk = base.proxyStatus !== null && isOk(base.proxyStatus);

  if (!directOk && proxyOk) {
    return oneFinding(base, "proxy-required", "proxy_required", "warning", "openProxy", "high");
  }
  if (directOk && !proxyOk) {
    return oneFinding(base, "proxy-broken", "proxy_broken", "warning", "openProxy", "high");
  }
  if (!directOk && !proxyOk) {
    return oneFinding(base, "both-failed", "both_failed", "error", "openZapret", "high");
  }
  if (directOk && proxyOk) {
    const speed = speedFinding(base, proxyConfigured);
    return { findings: speed === null ? [] : [speed], ok: true, skipped: false };
  }
  return { findings: [], ok: false, skipped: false };
}

function evaluateDirectOnly(base: FindingBase, direct: DiagnosticRunResult): ProbeVerdict {
  if (isOk(base.directStatus)) {
    return { findings: [], ok: true, skipped: false };
  }
  if (direct.proxyConfigured === false && direct.probe.proxy !== "none") {
    return oneFinding(
      base,
      "no-proxy",
      "direct_failed_no_proxy",
      "warning",
      "openProxy",
      "medium"
    );
  }
  return oneFinding(base, "both-failed", "both_failed", "error", "openZapret", "high");
}

function evaluateProbe(probeId: string, entry: GroupedProbe): ProbeVerdict {
  const direct = entry.direct;
  if (direct === undefined) {
    return { findings: [], ok: false, skipped: true };
  }
  const base: FindingBase = {
    group: direct.probe.group,
    probeId,
    probeLabelKey: direct.probe.labelKey,
    directStatus: probeStatus(direct),
    proxyStatus: entry.proxy === undefined ? null : probeStatus(entry.proxy),
    directLatencyMs: latencyOf(direct),
    proxyLatencyMs: latencyOf(entry.proxy),
  };

  if (base.directStatus === "skipped" && base.proxyStatus === null) {
    return { findings: [], ok: false, skipped: true };
  }
  if (base.directStatus === "auth" || base.proxyStatus === "auth") {
    return oneFinding(base, "auth", "auth_required", "warning", "none", "medium");
  }
  if (entry.proxy !== undefined) {
    return evaluateWithProxy(base, entry.proxy.proxyConfigured);
  }
  return evaluateDirectOnly(base, direct);
}

function groupResults(results: readonly DiagnosticRunResult[]): Map<string, GroupedProbe> {
  const byProbe = new Map<string, GroupedProbe>();
  for (const result of results) {
    const entry = byProbe.get(result.probe.id) ?? {};
    if (result.mode === "direct") entry.direct = result;
    else entry.proxy = result;
    byProbe.set(result.probe.id, entry);
  }
  return byProbe;
}

export function analyzeDiagnostics(results: readonly DiagnosticRunResult[]): DiagnosticReport {
  const byProbe = groupResults(results);
  const findings: DiagnosticFinding[] = [];
  let ok = 0;
  let skipped = 0;

  for (const [probeId, entry] of byProbe) {
    const outcome = evaluateProbe(probeId, entry);
    findings.push(...outcome.findings);
    if (outcome.ok) ok += 1;
    if (outcome.skipped) skipped += 1;
  }

  const severityRank = { error: 0, warning: 1, info: 2 } as const;
  findings.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.probeId.localeCompare(b.probeId)
  );

  const summary: DiagnosticSummary = {
    total: byProbe.size,
    ok,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    skipped,
  };

  return { findings, summary };
}
