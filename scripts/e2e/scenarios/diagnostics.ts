// Live diagnostics scenario: calls the real backend for every catalog probe.
//
// The direct pass runs with the isolated e2e profile (no app proxy). The proxy
// pass uses a local SOCKS5 stand and configures the usual `socks5://` form, so
// it also verifies that the backend normalizes it to remote-DNS `socks5h`.
// JSON/Markdown reports are written under the e2e report directory.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIAGNOSTIC_PROBES } from "../../../src/config/diagnostics/probes.config";
import type { NetworkDiagnosis } from "../../../src/types/api/network";
import type { DiagnosticProbe } from "../../../src/types/core/diagnostics";
import type { Scenario, ScenarioContext } from "../harness";
import { startSocks5Proxy } from "../socks5";

interface LiveProbeReply {
  id: string;
  diagnosis: NetworkDiagnosis | null;
  error: string | null;
}

interface ProbeInput {
  id: string;
  url: string;
  method: string;
  body?: string;
  expectedStatus: number[];
}

type DiagnosticMode = "direct" | "proxy";

interface ProbeReport extends LiveProbeReply {
  url: string;
  method: string;
  expectedStatus: number[];
  proxy: string;
  mode: DiagnosticMode;
  proxyUrl: string | null;
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replaceAll("|", "\\|");
}

function statusRow(report: ProbeReport): string {
  const diagnosis = report.diagnosis;
  const http = diagnosis?.https;
  return [
    report.id,
    diagnosis?.verdict ?? "error",
    cell(http?.status),
    cell(http?.latencyMs),
    cell(http?.errorStage),
    cell(http?.challenge ? "challenge" : null),
    cell(diagnosis?.dns.length),
    cell(diagnosis?.tcp.filter((probe) => probe.ok).length),
    cell(report.error ?? http?.error),
  ].join(" | ");
}

async function runProbes(
  page: ScenarioContext["page"],
  probes: readonly ProbeInput[],
  proxyUrl: string | null
): Promise<LiveProbeReply[]> {
  const replies = await page.evaluate(
    async (args: { probes: ProbeInput[]; proxyUrl: string | null }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (command: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (!internals) throw new Error("Tauri runtime not present in page");

      const queue = [...args.probes];
      const out: Array<{
        id: string;
        diagnosis: unknown;
        error: string | null;
      }> = [];

      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const probe = queue.shift();
          if (!probe) return;
          try {
            const invokeArgs: Record<string, unknown> = {
              url: probe.url,
              proxyUrl: args.proxyUrl,
              method: probe.method,
              expectedStatus: probe.expectedStatus,
            };
            if (probe.body !== undefined) invokeArgs.body = probe.body;
            const diagnosis = await internals.invoke("network_diagnose", invokeArgs);
            out.push({ id: probe.id, diagnosis, error: null });
          } catch (error) {
            out.push({
              id: probe.id,
              diagnosis: null,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      };

      await Promise.all(Array.from({ length: 4 }, worker));
      return out;
    },
    { probes: [...probes], proxyUrl }
  );

  return replies as LiveProbeReply[];
}

function buildReports(
  probes: readonly DiagnosticProbe[],
  replies: readonly LiveProbeReply[],
  mode: DiagnosticMode,
  proxyUrl: string | null
): ProbeReport[] {
  const byId = new Map(replies.map((reply) => [reply.id, reply]));
  return probes.map((probe) => {
    const reply = byId.get(probe.id);
    return {
      id: probe.id,
      url: probe.url,
      method: probe.method,
      expectedStatus: probe.expectedStatus,
      proxy: probe.proxy,
      mode,
      proxyUrl,
      diagnosis: (reply?.diagnosis as NetworkDiagnosis | undefined) ?? null,
      error: reply ? reply.error : "probe produced no reply",
    };
  });
}

function writeProbeReport(
  outDir: string,
  basename: string,
  title: string,
  note: string,
  reports: readonly ProbeReport[],
  extra?: Record<string, unknown>
): void {
  const generatedAt = new Date().toISOString();
  writeFileSync(
    join(outDir, `${basename}.json`),
    JSON.stringify({ generatedAt, note, ...extra, probes: reports }, null, 2)
  );

  const lines = [
    `# ${title}`,
    "",
    `Generated: ${generatedAt}`,
    "",
    note,
    "",
    "| probe | verdict | HTTP | latency, ms | stage | challenge | DNS | TCP ok | error |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...reports.map(statusRow),
    "",
    "## Probe URLs",
    "",
    ...reports.map((report) => `- ${report.id}: ${report.method} ${report.url}`),
    "",
  ];
  writeFileSync(join(outDir, `${basename}.md`), lines.join("\n"));

  for (const report of reports) {
    const diagnosis = report.diagnosis;
    console.log(
      `[diag:${report.mode}] ${report.id} verdict=${diagnosis?.verdict ?? "error"} http=${diagnosis?.https.status ?? "-"} ms=${diagnosis?.https.latencyMs ?? "-"} stage=${diagnosis?.https.errorStage ?? "-"} error=${report.error ?? diagnosis?.https.error ?? "-"}`
    );
  }
}

export const diagnostics: Scenario = {
  name: "diagnostics",
  async run({ page, outDir, step }) {
    let reports: ProbeReport[] = [];
    let proxyReports: ProbeReport[] = [];

    const inputs: ProbeInput[] = DIAGNOSTIC_PROBES.map((probe) => ({
      id: probe.id,
      url: probe.url,
      method: probe.method,
      body: probe.body,
      expectedStatus: probe.expectedStatus,
    }));

    await step("run all live probes through the app backend", async () => {
      const replies = await runProbes(page, inputs, null);
      reports = buildReports(DIAGNOSTIC_PROBES, replies, "direct", null);

      if (!reports.some((report) => report.diagnosis !== null)) {
        throw new Error("no probe returned a structured diagnosis");
      }

      writeProbeReport(
        outDir,
        "diagnostics-live",
        "Live diagnostics",
        "Direct path; the isolated e2e profile has no app proxy configured.",
        reports
      );
    });

    await step("run all live probes through a local SOCKS5 proxy", async () => {
      const proxy = await startSocks5Proxy();
      try {
        const replies = await runProbes(page, inputs, proxy.url);
        proxyReports = buildReports(DIAGNOSTIC_PROBES, replies, "proxy", proxy.url);

        const failed = proxyReports.filter(
          (report) => report.diagnosis === null || report.error !== null
        );
        if (failed.length > 0) {
          throw new Error(
            `proxy probes failed: ${failed
              .map((report) => `${report.id}${report.error ? ` (${report.error})` : ""}`)
              .join(", ")}`
          );
        }
        if (proxy.requests.length < inputs.length) {
          throw new Error(
            `proxy saw ${proxy.requests.length} requests for ${inputs.length} probes`
          );
        }
        const nonDomain = proxy.requests.filter((request) => request.atyp !== 3);
        if (nonDomain.length > 0) {
          throw new Error(
            `proxy received ${nonDomain.length} non-domain targets; remote DNS was not used`
          );
        }

        writeProbeReport(
          outDir,
          "diagnostics-live-proxy",
          "Live diagnostics — SOCKS5 proxy",
          `Proxy path via a local SOCKS5 stand at ${proxy.url}; the app was given socks5:// and normalized it to socks5h. CONNECTs: ${proxy.requests.length}, all remote-DNS.`,
          proxyReports,
          {
            transport: {
              url: proxy.url,
              requests: proxy.requests,
              errors: proxy.errors,
            },
          }
        );
        console.log(
          `[diag:proxy] requests=${proxy.requests.length} remote-dns=${proxy.requests.length} errors=${proxy.errors.length}`
        );
      } finally {
        await proxy.close();
      }
    });

    await step("diagnostics reports contain every catalog probe in both modes", async () => {
      for (const [mode, entries] of [
        ["direct", reports],
        ["proxy", proxyReports],
      ] as const) {
        if (entries.length !== DIAGNOSTIC_PROBES.length) {
          throw new Error(
            `expected ${DIAGNOSTIC_PROBES.length} ${mode} reports, got ${entries.length}`
          );
        }
        const missing = DIAGNOSTIC_PROBES.filter(
          (probe) => !entries.some((report) => report.id === probe.id)
        );
        if (missing.length > 0) {
          throw new Error(
            `missing ${mode} reports: ${missing.map((probe) => probe.id).join(", ")}`
          );
        }
      }
    });
  },
};
