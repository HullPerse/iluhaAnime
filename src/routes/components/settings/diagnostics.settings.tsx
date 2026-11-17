import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Play, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { DIAGNOSTIC_GROUPS, DIAGNOSTIC_PROBES } from "@/config/diagnostics/probes.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useSettingsSnapshot } from "@/hooks/settingsSnapshot.hook";
import { analyzeDiagnostics, probeStatus } from "@/lib/core/diagnostics/analyze.utils";
import {
  buildDiagnosticTasks,
  probeProxySettingsSection,
  resolveProbeProxy,
} from "@/lib/core/diagnostics/proxy.utils";
import { formatDiagnosticReport, redactProxyUrl } from "@/lib/core/diagnostics/report.utils";
import { runWithConcurrency } from "@/lib/core/diagnostics/run.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { showError } from "@/lib/core/ui/notification.utils";
import { settingsRoute } from "@/routes/__root.defs";
import { getSettingsSnapshot } from "@/store/settings.store";
import type {
  DiagnosticFinding,
  DiagnosticFindingCode,
  DiagnosticProbe,
  DiagnosticReport,
  DiagnosticRunResult,
  DiagnosticStatus,
} from "@/types/core/diagnostics";
import type { TranslationKey } from "@/types/core/i18n";
import { attempt } from "@hullperse/hp_utils/attempt";

type RunMode = "quick" | "full";

const COPIED_MS = 1500;

const STATUS_KEY: Record<DiagnosticStatus, TranslationKey> = {
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

const STATUS_CLASS: Record<DiagnosticStatus, string> = {
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

const FINDING_TITLE: Record<DiagnosticFindingCode, TranslationKey> = {
  proxy_required: "settings.diagnostics.finding.proxy_required.title",
  proxy_broken: "settings.diagnostics.finding.proxy_broken.title",
  both_failed: "settings.diagnostics.finding.both_failed.title",
  proxy_faster: "settings.diagnostics.finding.proxy_faster.title",
  direct_faster: "settings.diagnostics.finding.direct_faster.title",
  direct_failed_no_proxy: "settings.diagnostics.finding.direct_failed_no_proxy.title",
  auth_required: "settings.diagnostics.finding.auth_required.title",
};

const FINDING_DETAIL: Record<DiagnosticFindingCode, TranslationKey> = {
  proxy_required: "settings.diagnostics.finding.proxy_required.detail",
  proxy_broken: "settings.diagnostics.finding.proxy_broken.detail",
  both_failed: "settings.diagnostics.finding.both_failed.detail",
  proxy_faster: "settings.diagnostics.finding.proxy_faster.detail",
  direct_faster: "settings.diagnostics.finding.direct_faster.detail",
  direct_failed_no_proxy: "settings.diagnostics.finding.direct_failed_no_proxy.detail",
  auth_required: "settings.diagnostics.finding.auth_required.detail",
};

function ResultCell({ result }: { result: DiagnosticRunResult | undefined }) {
  const { t } = useI18n();
  if (!result) return <span className="text-hint">—</span>;
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

function ProxyAddress({ value }: { value: string }) {
  const redacted = redactProxyUrl(value);
  return (
    <span
      className="text-hint block max-w-56 text-xs break-all"
      title={redacted ?? value}
    >
      {redacted ?? value}
    </span>
  );
}

function ProxyCell({
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

function FindingRow({
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
    directMs: finding.directLatencyMs ?? "—",
    proxyMs: finding.proxyLatencyMs ?? "—",
  };
  const tone =
    finding.severity === "error"
      ? "text-destructive"
      : finding.severity === "warning"
        ? "text-highlight"
        : "text-hint";

  return (
    <div className="bg-field windows95-border flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1">
      <span className={`text-xs font-bold ${tone}`}>
        {t(FINDING_TITLE[finding.code])}
      </span>
      <span className="text-hint text-xs">{t(finding.probeLabelKey)}</span>
      <p className="text-hint min-w-0 flex-1 text-xs">
        {t(FINDING_DETAIL[finding.code], variables)}
      </p>
      {finding.action !== "none" && (
        <Button
          className="h-5 px-1.5 text-xs"
          variant="secondary"
          onClick={() => onJump(finding)}
        >
          {finding.action === "openProxy"
            ? t("settings.diagnostics.action.openProxy")
            : t("settings.diagnostics.action.openZapret")}
        </Button>
      )}
    </div>
  );
}

export default function SettingsDiagnostics() {
  const { t } = useI18n();
  const navigate = settingsRoute.useNavigate();
  const search = settingsRoute.useSearch();
  const settingsSnapshot = useSettingsSnapshot();
  const focusedProbe = useMemo(
    () => DIAGNOSTIC_PROBES.find((probe) => probe.id === search.probe) ?? null,
    [search.probe]
  );
  const [mode, setMode] = useState<RunMode>("quick");
  const [lastMode, setLastMode] = useState<RunMode>("quick");
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<DiagnosticRunResult[]>([]);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (focusedProbe?.weight === "optional") setMode("full");
  }, [focusedProbe]);

  const shownProbes = useMemo(
    () =>
      lastMode === "quick"
        ? DIAGNOSTIC_PROBES.filter((probe) => probe.weight === "critical")
        : DIAGNOSTIC_PROBES,
    [lastMode]
  );
  const byKey = useMemo(() => {
    const map = new Map<string, DiagnosticRunResult>();
    for (const result of results) {
      map.set(`${result.probe.id}:${result.mode}`, result);
    }
    return map;
  }, [results]);

  const startRun = async (probes: readonly DiagnosticProbe[], nextMode: RunMode) => {
    const tasks = buildDiagnosticTasks(probes, getSettingsSnapshot());
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const order = new Map<string, number>();
    for (const [index, task] of tasks.entries()) {
      order.set(`${task.probe.id}:${task.mode}`, index);
    }
    const collected: DiagnosticRunResult[] = [];
    setMode(nextMode);
    setRunning(true);
    setCancelled(false);
    setError(null);
    setResults([]);
    setReport(null);
    setDone(0);
    setTotal(tasks.length);
    setLastMode(nextMode);
    setCopied(false);

    await runWithConcurrency(tasks, 4, async (task) => {
      const [diagnosis, failure] = await attempt(
        systemApi.diagnoseNetwork(task.probe.url, task.proxyUrl, {
          method: task.probe.method,
          body: task.probe.body,
          expectedStatus: task.probe.expectedStatus,
        })
      );
      if (runIdRef.current !== runId) return;
      collected.push({
        ...task,
        diagnosis: diagnosis ?? null,
        error: failure?.message ?? null,
      });
      setDone((previous) => previous + 1);
    });

    if (runIdRef.current !== runId) return;
    collected.sort(
      (a, b) =>
        (order.get(`${a.probe.id}:${a.mode}`) ?? 0) -
        (order.get(`${b.probe.id}:${b.mode}`) ?? 0)
    );
    setResults(collected);
    setReport(analyzeDiagnostics(collected));
    setRunning(false);
  };

  const run = () => {
    const probes =
      mode === "quick"
        ? DIAGNOSTIC_PROBES.filter((probe) => probe.weight === "critical")
        : DIAGNOSTIC_PROBES;
    return startRun(probes, mode);
  };

  const runFocused = () => {
    if (focusedProbe === null) return Promise.resolve();
    return startRun(
      [focusedProbe],
      focusedProbe.weight === "critical" ? "quick" : "full"
    );
  };

  const cancel = () => {
    runIdRef.current += 1;
    setRunning(false);
    setCancelled(true);
  };

  const copy = async () => {
    if (report === null) return;
    const [, failure] = await attempt(
      writeText(formatDiagnosticReport(report, results))
    );
    if (failure !== null) {
      setError(failure.message);
      showError(t("settings.diagnostics.copy.error"), failure.message);
      return;
    }
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const configureProbe = (probe: DiagnosticProbe) => {
    const section = probeProxySettingsSection(probe.proxy);
    navigate({
      search: (prev) => ({
        ...prev,
        tab: "proxy",
        probe: undefined,
        section: section ?? undefined,
      }),
    });
  };

  const jumpFinding = (finding: DiagnosticFinding) => {
    if (finding.action === "openZapret") {
      navigate({
        search: (prev) => ({ ...prev, tab: "zapret", probe: undefined, section: undefined }),
      });
      return;
    }
    const probe = DIAGNOSTIC_PROBES.find((entry) => entry.id === finding.probeId);
    if (probe) configureProbe(probe);
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel" data-find-section="diagnostics.run">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.diagnostics")}</span>
        </div>
        <div className="flex flex-col gap-2 p-2">
          {focusedProbe !== null && (
            <p className="text-highlight windows95-text bg-field windows95-border px-2 py-1 text-xs">
              {t("settings.diagnostics.fromError", { probe: t(focusedProbe.labelKey) })}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-hint text-xs">{t("settings.diagnostics.mode.label")}</span>
              <Select
                label={t("settings.diagnostics.mode.label")}
                value={mode}
                onChange={(next) => setMode(next as RunMode)}
                options={[
                  { value: "quick", label: t("settings.diagnostics.mode.quick") },
                  { value: "full", label: t("settings.diagnostics.mode.full") },
                ]}
                disabled={running}
                className="w-44"
              />
            </div>
            <Button
              className="h-7 px-3 text-xs"
              loading={running}
              onClick={() => {
                ignore(run());
              }}
            >
              <Play className="size-3" />
              {report === null ? t("settings.diagnostics.run") : t("settings.diagnostics.rerun")}
            </Button>
            {focusedProbe !== null && (
              <Button
                variant="secondary"
                className="h-7 px-3 text-xs"
                disabled={running}
                onClick={() => {
                  ignore(runFocused());
                }}
              >
                {t("settings.diagnostics.runFocused")}
              </Button>
            )}
            {running && (
              <Button
                variant="secondary"
                className="h-7 px-3 text-xs"
                onClick={cancel}
              >
                <X className="size-3" />
                {t("settings.diagnostics.cancel")}
              </Button>
            )}
            <Button
              variant="secondary"
              className="ml-auto h-7 px-3 text-xs"
              disabled={report === null}
              onClick={() => {
                ignore(copy());
              }}
            >
              <Copy className="size-3" />
              {copied ? t("settings.diagnostics.copied") : t("settings.diagnostics.copy")}
            </Button>
          </div>
          {(running || cancelled || error !== null) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {running && (
                <span className="text-hint windows95-text">
                  {t("settings.diagnostics.running", { done, total })}
                </span>
              )}
              {cancelled && (
                <span className="text-hint windows95-text">
                  {t("settings.diagnostics.cancelled")}
                </span>
              )}
              {error !== null && (
                <span className="text-destructive windows95-text">{error}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {report !== null && (
        <section className="ui-panel" data-find-section="diagnostics.summary">
          <div className="ui-titlebar flex items-center justify-between gap-1">
            <span className="text-title-text font-bold">
              {t("settings.diagnostics.summary.title")}
            </span>
            <span className="text-hint windows95-text text-xs">
              {t("settings.diagnostics.summary", {
                total: report.summary.total,
                ok: report.summary.ok,
                warnings: report.summary.warnings,
                errors: report.summary.errors,
              })}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2">
            {report.findings.length === 0 ? (
              <p className="text-success windows95-text text-xs">
                {t("settings.diagnostics.no.findings")}
              </p>
            ) : (
              report.findings.map((finding) => (
                <FindingRow key={finding.id} finding={finding} onJump={jumpFinding} />
              ))
            )}
          </div>
        </section>
      )}

      {report !== null && (
        <section className="ui-panel" data-find-section="diagnostics.matrix">
          <div className="ui-titlebar flex items-center justify-between gap-1">
            <span className="text-title-text font-bold">
              {t("settings.diagnostics.table.title")}
            </span>
          </div>
          <div className="max-h-[65vh] overflow-auto p-2">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-hint text-left">
                  <th className="bg-primary sticky top-0 z-10 border-b border-current p-1 font-normal">
                    {t("settings.diagnostics.table.probe")}
                  </th>
                  <th className="bg-primary sticky top-0 z-10 border-b border-current p-1 font-normal">
                    {t("settings.diagnostics.table.direct")}
                  </th>
                  <th className="bg-primary sticky top-0 z-10 border-b border-current p-1 font-normal">
                    {t("settings.diagnostics.table.proxy")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {DIAGNOSTIC_GROUPS.map((group) => {
                  const groupProbes = shownProbes.filter(
                    (probe) => probe.group === group.id
                  );
                  if (groupProbes.length === 0) return null;
                  return (
                    <Fragment key={group.id}>
                      <tr>
                        <td
                          colSpan={3}
                          className="text-highlight bg-secondary/20 p-1 text-xs font-bold"
                        >
                          {t(group.labelKey)}
                        </td>
                      </tr>
                      {groupProbes.map((probe) => (
                        <tr
                          key={probe.id}
                          className={
                            probe.id === focusedProbe?.id
                              ? "bg-secondary/20 align-top"
                              : "hover:bg-secondary/10 align-top"
                          }
                        >
                          <td className="p-1">{t(probe.labelKey)}</td>
                          <td className="p-1">
                            <ResultCell
                              result={byKey.get(`${probe.id}:direct`)}
                            />
                          </td>
                          <td className="p-1">
                            <ProxyCell
                              probe={probe}
                              result={byKey.get(`${probe.id}:proxy`)}
                              configuredProxy={resolveProbeProxy(
                                probe.proxy,
                                settingsSnapshot
                              )}
                              onConfigure={configureProbe}
                            />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
