import type { DiagnosticRunMode } from "@/types/core/diagnostics";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Play, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { systemApi } from "@/api/system.api";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { DIAGNOSTIC_GROUPS, DIAGNOSTIC_PROBES } from "@/config/diagnostics/probes.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useSettingsSnapshot } from "@/hooks/settingsSnapshot.hook";
import { analyzeDiagnostics } from "@/lib/core/diagnostics/analyze.utils";
import {
  buildDiagnosticTasks,
  probeProxySettingsSection,
  resolveProbeProxy,
} from "@/lib/core/diagnostics/proxy.utils";
import { formatDiagnosticReport } from "@/lib/core/diagnostics/report.utils";
import { runWithConcurrency } from "@/lib/core/diagnostics/run.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { showError } from "@/lib/core/ui/notification.utils";
import { settingsRoute } from "@/routes/__root.defs";
import { getSettingsSnapshot } from "@/store/settings.store";
import type {
  DiagnosticFinding,
  DiagnosticProbe,
  DiagnosticReport,
  DiagnosticRunResult,
} from "@/types/core/diagnostics";
import { attempt } from "@hullperse/hp_utils/attempt";
import { ResultCell } from "@/routes/components/settings/diagnostics/resultCell.diagnostics";
import { ProxyCell } from "@/routes/components/settings/diagnostics/proxyCell.diagnostics";
import { FindingRow } from "@/routes/components/settings/diagnostics/findingRow.diagnostics";
import { COPIED_MS } from "@/config/diagnostics/display.config";

export default function SettingsDiagnostics() {
  const { t } = useI18n();
  const navigate = settingsRoute.useNavigate();
  const search = settingsRoute.useSearch();
  const settingsSnapshot = useSettingsSnapshot();
  const focusedProbe = useMemo(
    () => DIAGNOSTIC_PROBES.find((probe) => probe.id === search.probe) ?? null,
    [search.probe]
  );
  const [mode, setMode] = useState<DiagnosticRunMode>("quick");
  const [lastMode, setLastMode] = useState<DiagnosticRunMode>("quick");
  const [running, setRunning] = useState<boolean>(false);
  const [cancelled, setCancelled] = useState<boolean>(false);
  const [done, setDone] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [results, setResults] = useState<DiagnosticRunResult[]>([]);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef<number>(0);
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

  const startRun = async (probes: readonly DiagnosticProbe[], nextMode: DiagnosticRunMode) => {
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
        (order.get(`${a.probe.id}:${a.mode}`) ?? 0) - (order.get(`${b.probe.id}:${b.mode}`) ?? 0)
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

    return startRun([focusedProbe], focusedProbe.weight === "critical" ? "quick" : "full");
  };

  const cancel = () => {
    runIdRef.current += 1;
    setRunning(false);
    setCancelled(true);
  };

  const copy = async () => {
    if (report === null) return;
    const [, failure] = await attempt(writeText(formatDiagnosticReport(report, results)));

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
                onChange={(next) => {
                  if (next === "quick" || next === "full") setMode(next);
                }}
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
              <Button variant="secondary" className="h-7 px-3 text-xs" onClick={cancel}>
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
              {error !== null && <span className="text-destructive windows95-text">{error}</span>}
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
                  const groupProbes = shownProbes.filter((probe) => probe.group === group.id);

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
                            <ResultCell result={byKey.get(`${probe.id}:direct`)} />
                          </td>
                          <td className="p-1">
                            <ProxyCell
                              probe={probe}
                              result={byKey.get(`${probe.id}:proxy`)}
                              configuredProxy={resolveProbeProxy(probe.proxy, settingsSnapshot)}
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
