import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TorrentDiagnosticsSettings } from "@/routes/components/settings/torrent/diagnostics.torrent";
import { patchSettings } from "@/store/settings.store";
import type { NetworkDiagnosis } from "@/types/api/network";

import { mockInvoke } from "@/tests/mocks";

const REPORT: NetworkDiagnosis = {
  host: "rutracker.org",
  port: 443,
  proxy: null,
  dns: [
    { address: "104.21.32.39", family: "ipv4" },
    { address: "172.67.182.196", family: "ipv4" },
  ],
  dnsError: null,
  tcp: [
    { address: "104.21.32.39", family: "ipv4", ok: true, latencyMs: 24, error: null },
    { address: "172.67.182.196", family: "ipv4", ok: true, latencyMs: 31, error: null },
  ],
  ipv6Reachable: null,
  https: {
    ok: true,
    status: 200,
    httpVersion: "HTTP/1.1",
    remoteAddress: "104.21.32.39",
    latencyMs: 505,
    challenge: false,
    errorStage: null,
    error: null,
  },
  verdict: "ok",
};

const serve = (report: NetworkDiagnosis) => {
  mockInvoke.mockImplementation((command: string) =>
    command === "network_diagnose" ? Promise.resolve(report) : Promise.resolve(null)
  );
};

const runCheck = () => {
  fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
};

beforeEach(() => {
  patchSettings({ language: "ru", searchProxyUrls: {} });
});

afterEach(() => {
  cleanup();
});

describe("TorrentDiagnosticsSettings", () => {
  it("shows the verdict and every stage of a successful check", async () => {
    serve(REPORT);
    const commits: string[] = [];
    render(
      <Profiler id="torrent-diagnostics" onRender={(_, phase) => commits.push(phase)}>
        <TorrentDiagnosticsSettings />
      </Profiler>
    );

    const button = screen.getByRole("button", { name: "Проверить" });
    runCheck();

    expect(await screen.findByText("RuTracker доступен")).not.toBeNull();
    expect(screen.getByText("Все стадии пройдены.")).not.toBeNull();
    expect(screen.getByText("104.21.32.39, 172.67.182.196")).not.toBeNull();
    expect(screen.getByText("104.21.32.39: 24 мс")).not.toBeNull();
    expect(screen.getByText("HTTP 200, HTTP/1.1, 505 мс")).not.toBeNull();
    expect(screen.getByText("удалённый адрес: 104.21.32.39")).not.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("network_diagnose", {
      url: "https://rutracker.org/forum/index.php",
      proxyUrl: null,
    });
    expect(screen.getByRole("button", { name: "Проверить снова" })).toBe(button);
    expect(commits).toEqual(["mount", "update", "update"]);
  });

  it("reports an anti-bot challenge as a failure", async () => {
    serve({
      ...REPORT,
      verdict: "anti_bot",
      https: { ...REPORT.https, challenge: true },
    });
    render(<TorrentDiagnosticsSettings />);

    runCheck();

    expect(await screen.findByText("Anti-bot защита")).not.toBeNull();
    expect(screen.getByText("В ответе страница проверки, а не форум.")).not.toBeNull();
    expect(screen.getByText("В ответе есть anti-bot проверка.")).not.toBeNull();
    expect(screen.queryByText("RuTracker доступен")).toBeNull();
  });

  it("uses the RuTracker source proxy without exposing its credentials", async () => {
    patchSettings({
      searchProxyUrls: { rutracker: "socks5://user:secret@127.0.0.1:1080" },
    });
    serve({ ...REPORT, proxy: "socks5://127.0.0.1:1080" });
    render(<TorrentDiagnosticsSettings />);

    runCheck();

    expect(await screen.findByText("socks5://127.0.0.1:1080")).not.toBeNull();
    expect(screen.queryByText(/secret/u)).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("network_diagnose", {
      url: "https://rutracker.org/forum/index.php",
      proxyUrl: "socks5://user:secret@127.0.0.1:1080",
    });
  });

  it("surfaces a command failure inline", async () => {
    mockInvoke.mockRejectedValue(new Error("dns lookup failed"));
    render(<TorrentDiagnosticsSettings />);

    runCheck();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Проверка не удалась: dns lookup failed");
  });
});
