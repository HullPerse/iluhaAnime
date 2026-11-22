import { describe, expect, it } from "vitest";

import { DIAGNOSTIC_PROBES } from "@/config/diagnostics/probes.config";
import { analyzeDiagnostics, probeStatus } from "@/lib/core/diagnostics/analyze.utils";
import {
  buildDiagnosticTasks,
  probeProxySettingsSection,
  resolveProbeProxy,
} from "@/lib/core/diagnostics/proxy.utils";
import { redactProxyUrl } from "@/lib/core/diagnostics/report.utils";
import type { DiagnosticProbe, DiagnosticRunResult } from "@/types/core/diagnostics";
import type { NetworkDiagnosis, NetworkVerdict } from "@/types/api/network";
import type { SettingsData } from "@/types/store/settings";

const settings = {
  anilistProxyUrl: "socks5://user:pass@127.0.0.1:10808",
  cardsImageProxyUrl: null,
  dailyProxyUrl: "http://daily.proxy:8080",
  dailyOpeningProxyUrl: "",
  animelibProxyUrl: null,
  newsProxyUrl: null,
  searchProxyUrls: {
    nyaa: "http://nyaa.proxy:8080",
    sukebei: "http://sukebei.proxy:8080",
  },
} as unknown as SettingsData;

function probe(id: string): DiagnosticProbe {
  const found = DIAGNOSTIC_PROBES.find((entry) => entry.id === id);

  if (!found) throw new Error(`missing probe ${id}`);

  return found;
}

function diagnosis(
  verdict: NetworkVerdict,
  latencyMs = 100,
  status: number | null = 200
): NetworkDiagnosis {
  return {
    host: "example.com",
    port: 443,
    proxy: null,
    dns: [],
    dnsError: null,
    tcp: [],
    ipv6Reachable: null,
    https: {
      ok: verdict === "ok",
      status,
      httpVersion: "HTTP/1.1",
      remoteAddress: null,
      latencyMs,
      challenge: verdict === "anti_bot",
      errorStage: verdict === "request_failed" ? "client" : null,
      error: verdict === "request_failed" ? "operation timed out" : null,
    },
    verdict,
  };
}

function run(
  entry: DiagnosticProbe,
  mode: "direct" | "proxy",
  result: NetworkDiagnosis | null,
  options?: { proxyConfigured?: boolean; error?: string | null }
): DiagnosticRunResult {
  return {
    probe: entry,
    mode,
    proxyUrl: mode === "proxy" ? "socks5://127.0.0.1:1080" : null,
    proxyConfigured: options?.proxyConfigured ?? true,
    diagnosis: result,
    error: options?.error ?? null,
  };
}

describe("diagnostics proxy resolver", () => {
  it("inherits the AniList proxy for card images, Daily and AnimeLib", () => {
    expect(resolveProbeProxy("cardsImage", settings)).toBe("socks5://user:pass@127.0.0.1:10808");
    expect(resolveProbeProxy("daily", settings)).toBe("http://daily.proxy:8080");
    expect(resolveProbeProxy("dailyOpening", settings)).toBe("socks5://user:pass@127.0.0.1:10808");
    expect(resolveProbeProxy("animelib", settings)).toBe("socks5://user:pass@127.0.0.1:10808");
  });

  it("reads source proxies and falls back from Sukebei to Nyaa", () => {
    expect(resolveProbeProxy("source:nyaa", settings)).toBe("http://nyaa.proxy:8080");
    expect(resolveProbeProxy("source:sukebei", settings)).toBe("http://sukebei.proxy:8080");
    expect(resolveProbeProxy("source:rutracker", settings)).toBeNull();
    expect(resolveProbeProxy("none", settings)).toBeNull();

    const inherited = {
      ...settings,
      searchProxyUrls: { nyaa: "http://nyaa.proxy:8080" },
    } as SettingsData;
    expect(resolveProbeProxy("source:sukebei", inherited)).toBe("http://nyaa.proxy:8080");
  });

  it("maps each proxy key to the settings section that owns it", () => {
    expect(probeProxySettingsSection("anilist")).toBe("proxy.anilist");
    expect(probeProxySettingsSection("daily")).toBe("proxy.collection");
    expect(probeProxySettingsSection("dailyOpening")).toBe("proxy.collection");
    expect(probeProxySettingsSection("cardsImage")).toBe("proxy.collection");
    expect(probeProxySettingsSection("animelib")).toBe("proxy.animelib");
    expect(probeProxySettingsSection("news")).toBe("proxy.news");
    expect(probeProxySettingsSection("source:sukebei")).toBe("proxy.sources");
    expect(probeProxySettingsSection("none")).toBeNull();
  });

  it("builds direct and proxy tasks only when a proxy is configured", () => {
    const tasks = buildDiagnosticTasks([probe("anilist-graphql")], settings);
    expect(tasks.map((task) => task.mode)).toEqual(["direct", "proxy"]);
    expect(tasks[0]?.proxyConfigured).toBe(true);
    expect(tasks[1]?.proxyUrl).toBe("socks5://user:pass@127.0.0.1:10808");

    const noProxy = buildDiagnosticTasks([probe("updates-github")], settings);
    expect(noProxy.map((task) => task.mode)).toEqual(["direct"]);
    expect(noProxy[0]?.proxyConfigured).toBe(false);
  });
});

describe("diagnostics status mapping", () => {
  it("maps verdicts to readable statuses", () => {
    expect(probeStatus(run(probe("anilist-graphql"), "direct", diagnosis("ok", 120)))).toBe("ok");
    expect(probeStatus(run(probe("anilist-graphql"), "direct", diagnosis("ok", 2500)))).toBe(
      "slow"
    );
    expect(
      probeStatus(run(probe("anilist-graphql"), "direct", diagnosis("tcp_failed", 0, null)))
    ).toBe("tcp");
    expect(
      probeStatus(run(probe("anilist-graphql"), "direct", diagnosis("http_status", 20, 401)))
    ).toBe("auth");
    expect(
      probeStatus(run(probe("anilist-graphql"), "direct", diagnosis("request_failed", 0, null)))
    ).toBe("timeout");
    expect(probeStatus(run(probe("anilist-graphql"), "proxy", null, { error: "bad proxy" }))).toBe(
      "proxy"
    );
  });
});

describe("diagnostics analyzer", () => {
  it("reports a proxy-required path", () => {
    const entry = probe("anilist-graphql");
    const report = analyzeDiagnostics([
      run(entry, "direct", diagnosis("tcp_failed", 0, null)),
      run(entry, "proxy", diagnosis("ok", 180)),
    ]);
    expect(report.findings[0]?.code).toBe("proxy_required");
    expect(report.findings[0]?.action).toBe("openProxy");
  });

  it("reports a broken proxy when direct access works", () => {
    const entry = probe("anilist-graphql");
    const report = analyzeDiagnostics([
      run(entry, "direct", diagnosis("ok", 120)),
      run(entry, "proxy", diagnosis("dns_failed", 0, null)),
    ]);
    expect(report.findings[0]?.code).toBe("proxy_broken");
    expect(report.summary.warnings).toBe(1);
  });

  it("separates a proxy problem from a host-level outage", () => {
    const entry = probe("anilist-graphql");
    const report = analyzeDiagnostics([
      run(entry, "direct", diagnosis("tls_failed", 0, null)),
      run(entry, "proxy", diagnosis("tcp_failed", 0, null)),
    ]);
    expect(report.findings[0]?.code).toBe("both_failed");
    expect(report.findings[0]?.action).toBe("openZapret");
    expect(report.summary.errors).toBe(1);
  });

  it("marks a direct-faster path without treating it as an error", () => {
    const entry = probe("anilist-graphql");
    const directFaster = analyzeDiagnostics([
      run(entry, "direct", diagnosis("ok", 100)),
      run(entry, "proxy", diagnosis("ok", 2000)),
    ]);
    expect(directFaster.findings[0]?.code).toBe("direct_faster");
    expect(directFaster.summary.errors).toBe(0);
    expect(directFaster.summary.ok).toBe(1);
  });

  it("hides proxy-faster noise when the proxy is already configured", () => {
    const entry = probe("anilist-graphql");
    const report = analyzeDiagnostics([
      run(entry, "direct", diagnosis("ok", 2000)),
      run(entry, "proxy", diagnosis("ok", 100)),
    ]);
    expect(report.findings).toEqual([]);
    expect(report.summary.ok).toBe(1);
  });

  it("still reports proxy-faster when no proxy is configured", () => {
    const entry = probe("anilist-graphql");
    const report = analyzeDiagnostics([
      run(entry, "direct", diagnosis("ok", 2000), { proxyConfigured: false }),
      run(entry, "proxy", diagnosis("ok", 100), { proxyConfigured: false }),
    ]);
    expect(report.findings[0]?.code).toBe("proxy_faster");
  });

  it("warns when a direct-only probe fails and no proxy is configured", () => {
    const entry = probe("anilist-graphql");
    const report = analyzeDiagnostics([
      run(entry, "direct", diagnosis("tcp_failed", 0, null), { proxyConfigured: false }),
    ]);
    expect(report.findings[0]?.code).toBe("direct_failed_no_proxy");
    expect(report.summary.warnings).toBe(1);
  });
});

describe("diagnostics report redaction", () => {
  it("removes proxy credentials from exported text", () => {
    expect(redactProxyUrl("socks5://user:secret@127.0.0.1:1080")).toBe(
      "socks5://***:***@127.0.0.1:1080"
    );
    expect(redactProxyUrl("not-a-url")).toBe("not-a-url");
  });
});
