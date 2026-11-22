import type { NetworkDiagnosis } from "@/types/api/network";
import type { TranslationKey } from "@/types/core/i18n";

export type DiagnosticGroup =
  | "collection"
  | "daily"
  | "openings"
  | "torrents"
  | "images"
  | "news"
  | "updates";

export type DiagnosticMethod = "GET" | "HEAD" | "POST";

export type DiagnosticProxyKey =
  | "anilist"
  | "cardsImage"
  | "daily"
  | "dailyOpening"
  | "animelib"
  | "news"
  | "none"
  | `source:${string}`;

export type DiagnosticWeight = "critical" | "optional";

export interface DiagnosticProbe {
  id: string;
  group: DiagnosticGroup;
  labelKey: TranslationKey;
  url: string;
  method: DiagnosticMethod;
  body?: string;
  expectedStatus: number[];
  proxy: DiagnosticProxyKey;
  weight: DiagnosticWeight;
}

export type DiagnosticMode = "direct" | "proxy";

export interface DiagnosticTask {
  probe: DiagnosticProbe;
  mode: DiagnosticMode;
  proxyUrl: string | null;
  proxyConfigured: boolean;
}

export interface DiagnosticRunResult {
  probe: DiagnosticProbe;
  mode: DiagnosticMode;
  proxyUrl: string | null;
  proxyConfigured: boolean;
  diagnosis: NetworkDiagnosis | null;
  error: string | null;
}

export type DiagnosticStatus =
  | "ok"
  | "slow"
  | "dns"
  | "tcp"
  | "tls"
  | "http"
  | "antibot"
  | "auth"
  | "proxy"
  | "timeout"
  | "error"
  | "skipped";

export type DiagnosticFindingCode =
  | "proxy_required"
  | "proxy_broken"
  | "both_failed"
  | "proxy_faster"
  | "direct_faster"
  | "direct_failed_no_proxy"
  | "auth_required";

export type DiagnosticAction = "openProxy" | "openZapret" | "none";

export type DiagnosticConfidence = "high" | "medium" | "low";

export interface DiagnosticFinding {
  id: string;
  code: DiagnosticFindingCode;
  severity: "info" | "warning" | "error";
  group: DiagnosticGroup;
  probeId: string;
  probeLabelKey: TranslationKey;
  directStatus: DiagnosticStatus;
  proxyStatus: DiagnosticStatus | null;
  directLatencyMs: number | null;
  proxyLatencyMs: number | null;
  action: DiagnosticAction;
  confidence: DiagnosticConfidence;
}

export interface DiagnosticSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  skipped: number;
}

export interface DiagnosticReport {
  findings: DiagnosticFinding[];
  summary: DiagnosticSummary;
}

export type DiagnosticRunMode = "quick" | "full";
