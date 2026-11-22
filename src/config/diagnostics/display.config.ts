import type { DiagnosticFindingCode, DiagnosticStatus } from "@/types/core/diagnostics";
import type { TranslationKey } from "@/types/core/i18n";

export const COPIED_MS = 1500;

export const STATUS_KEY: Record<DiagnosticStatus, TranslationKey> = {
  ok: "settings.diagnostics.status.ok",
  slow: "settings.diagnostics.status.slow",
  dns: "settings.diagnostics.status.dns",
  tcp: "settings.diagnostics.status.tcp",
  tls: "settings.diagnostics.status.tls",
  http: "settings.diagnostics.status.http",
  antibot: "settings.diagnostics.status.antibot",
  auth: "settings.diagnostics.status.auth",
  proxy: "settings.diagnostics.status.proxy",
  timeout: "settings.diagnostics.status.timeout",
  error: "settings.diagnostics.status.error",
  skipped: "settings.diagnostics.status.skipped",
};

export const STATUS_CLASS: Record<DiagnosticStatus, string> = {
  ok: "text-success",
  slow: "text-highlight",
  dns: "text-destructive",
  tcp: "text-destructive",
  tls: "text-destructive",
  http: "text-destructive",
  antibot: "text-destructive",
  auth: "text-highlight",
  proxy: "text-destructive",
  timeout: "text-destructive",
  error: "text-destructive",
  skipped: "text-hint",
};

export const FINDING_TITLE: Record<DiagnosticFindingCode, TranslationKey> = {
  proxy_required: "settings.diagnostics.finding.proxy_required.title",
  proxy_broken: "settings.diagnostics.finding.proxy_broken.title",
  both_failed: "settings.diagnostics.finding.both_failed.title",
  proxy_faster: "settings.diagnostics.finding.proxy_faster.title",
  direct_faster: "settings.diagnostics.finding.direct_faster.title",
  direct_failed_no_proxy: "settings.diagnostics.finding.direct_failed_no_proxy.title",
  auth_required: "settings.diagnostics.finding.auth_required.title",
};

export const FINDING_DETAIL: Record<DiagnosticFindingCode, TranslationKey> = {
  proxy_required: "settings.diagnostics.finding.proxy_required.detail",
  proxy_broken: "settings.diagnostics.finding.proxy_broken.detail",
  both_failed: "settings.diagnostics.finding.both_failed.detail",
  proxy_faster: "settings.diagnostics.finding.proxy_faster.detail",
  direct_faster: "settings.diagnostics.finding.direct_faster.detail",
  direct_failed_no_proxy: "settings.diagnostics.finding.direct_failed_no_proxy.detail",
  auth_required: "settings.diagnostics.finding.auth_required.detail",
};
