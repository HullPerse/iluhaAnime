import { useState } from "react";
import type { ReactNode } from "react";

import { systemApi } from "@/api/system.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { attempt } from "@hullperse/hp_utils/attempt";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";
import type { NetworkDiagnosis, NetworkVerdict } from "@/types/api/network";
import type { TFunc } from "@/types/core/i18n";

const RUTRACKER_DIAGNOSTICS_URL = "https://rutracker.org/forum/index.php";

function verdictLabel(verdict: NetworkVerdict, t: TFunc): string {
  switch (verdict) {
    case "ok": {
      return t("settings.torrent.diagnostics.verdict.ok");
    }
    case "dns_failed": {
      return t("settings.torrent.diagnostics.verdict.dns");
    }
    case "tcp_failed": {
      return t("settings.torrent.diagnostics.verdict.tcp");
    }
    case "tls_failed": {
      return t("settings.torrent.diagnostics.verdict.tls");
    }
    case "http_status": {
      return t("settings.torrent.diagnostics.verdict.http");
    }
    case "anti_bot": {
      return t("settings.torrent.diagnostics.verdict.antibot");
    }
    case "request_failed": {
      return t("settings.torrent.diagnostics.verdict.request");
    }
  }
}

function verdictDetail(report: NetworkDiagnosis, t: TFunc): string {
  const { https } = report;
  switch (report.verdict) {
    case "ok": {
      return t("settings.torrent.diagnostics.verdict.ok.detail");
    }
    case "http_status": {
      return t("settings.torrent.diagnostics.verdict.http.detail", {
        status: https.status ?? "-",
      });
    }
    case "anti_bot": {
      return t("settings.torrent.diagnostics.verdict.antibot.detail");
    }
    case "dns_failed": {
      return report.dnsError ?? t("settings.torrent.diagnostics.none");
    }
    case "tcp_failed": {
      return report.tcp.find((probe) => !probe.ok)?.error ?? t("settings.torrent.diagnostics.none");
    }
    case "tls_failed":
    case "request_failed": {
      return https.error ?? t("settings.torrent.diagnostics.none");
    }
  }
}

function stageLabel(stage: string | null, t: TFunc): string {
  switch (stage) {
    case "dns": {
      return t("settings.torrent.diagnostics.stage.dns");
    }
    case "tcp": {
      return t("settings.torrent.diagnostics.stage.tcp");
    }
    case "tls": {
      return t("settings.torrent.diagnostics.stage.tls");
    }
    case "client": {
      return t("settings.torrent.diagnostics.stage.client");
    }
    default: {
      return t("settings.torrent.diagnostics.stage.request");
    }
  }
}

function StageRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 text-xs">
      <span className="windows95-text text-hint">{label}</span>
      <div className="windows95-text min-w-0 wrap-break-word">{children}</div>
    </div>
  );
}

export function TorrentDiagnosticsSettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const proxyUrl = useCell(settingsAtoms.searchProxyUrls).rutracker?.trim() ?? "";
  const [report, setReport] = useState<NetworkDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const [result, failure] = await attempt(
      systemApi.diagnoseNetwork(RUTRACKER_DIAGNOSTICS_URL, proxyUrl || null)
    );
    setLoading(false);
    if (failure) {
      setReport(null);
      setError(failure.message);
      return;
    }
    setReport(result);
  };

  const actionLabel =
    report === null
      ? t("settings.torrent.diagnostics.action")
      : t("settings.torrent.diagnostics.retry");

  return (
    <section className="ui-panel" data-find-section="torrent.diagnostics">
      <div className="ui-titlebar">
        <span className="text-title-text font-bold">{t("settings.torrent.diagnostics")}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-6 px-2 text-xs"
            loading={loading}
            disabled={!isOnline}
            aria-label={actionLabel}
            title={!isOnline ? t("tabs.offlineUnavailable") : undefined}
            onClick={() => {
              run().catch(() => undefined);
            }}
          >
            {actionLabel}
          </Button>
          <span className="text-hint windows95-text text-xs">
            {proxyUrl
              ? t("settings.torrent.diagnostics.via.proxy")
              : t("settings.torrent.diagnostics.via.direct")}
          </span>
        </div>

        {error !== null && (
          <span className="text-destructive windows95-text text-xs" role="alert">
            {t("settings.torrent.diagnostics.failed")}: {error}
          </span>
        )}

        {report !== null && (
          <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
            <div className="flex flex-col gap-0.5">
              <span
                className={`windows95-text text-xs font-bold ${
                  report.verdict === "ok" ? "text-success" : "text-destructive"
                }`}
              >
                {verdictLabel(report.verdict, t)}
              </span>
              <span className="windows95-text text-hint text-xs wrap-break-word">
                {verdictDetail(report, t)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <StageRow label={t("settings.torrent.diagnostics.stage.dns")}>
                {report.dnsError !== null ? (
                  <span className="text-destructive">{report.dnsError}</span>
                ) : report.dns.length === 0 ? (
                  t("settings.torrent.diagnostics.none")
                ) : (
                  report.dns.map((answer) => answer.address).join(", ")
                )}
              </StageRow>

              <StageRow label={t("settings.torrent.diagnostics.stage.tcp")}>
                {report.tcp.length === 0 ? (
                  t("settings.torrent.diagnostics.none")
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {report.tcp.map((probe) => (
                      <span
                        key={probe.address}
                        className={probe.ok ? undefined : "text-destructive"}
                      >
                        {probe.address}:{" "}
                        {probe.ok
                          ? t("settings.torrent.diagnostics.tcp.ok", {
                              latency: probe.latencyMs,
                            })
                          : (probe.error ?? t("settings.torrent.diagnostics.unavailable"))}
                      </span>
                    ))}
                  </div>
                )}
              </StageRow>

              <StageRow label={t("settings.torrent.diagnostics.stage.https")}>
                {report.https.error !== null ? (
                  <span className="text-destructive">
                    {t("settings.torrent.diagnostics.https.fail", {
                      stage: stageLabel(report.https.errorStage, t),
                      error: report.https.error,
                    })}
                  </span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span>
                      {t("settings.torrent.diagnostics.https.summary", {
                        status: report.https.status ?? "-",
                        version: report.https.httpVersion ?? "-",
                        latency: report.https.latencyMs,
                      })}
                    </span>
                    {report.https.remoteAddress !== null && (
                      <span className="text-hint">
                        {t("settings.torrent.diagnostics.https.remote", {
                          address: report.https.remoteAddress,
                        })}
                      </span>
                    )}
                    {report.https.challenge && (
                      <span className="text-destructive">
                        {t("settings.torrent.diagnostics.challenge")}
                      </span>
                    )}
                  </div>
                )}
              </StageRow>

              <StageRow label={t("settings.torrent.diagnostics.stage.ipv6")}>
                {report.ipv6Reachable === null
                  ? t("settings.torrent.diagnostics.none")
                  : report.ipv6Reachable
                    ? t("settings.torrent.diagnostics.available")
                    : t("settings.torrent.diagnostics.unavailable")}
              </StageRow>

              <StageRow label={t("settings.torrent.diagnostics.stage.proxy")}>
                {report.proxy ?? t("settings.torrent.diagnostics.no.proxy")}
              </StageRow>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
