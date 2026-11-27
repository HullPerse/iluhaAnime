import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "@/tests/mocks";

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { translate } from "@/lib/locale/i18n.utils";
import { formatPreparationTime, getPlayerDiagnostics } from "@/lib/player/diagnostics.utils";
import DiagnosticsOverlay from "@/routes/components/player/media/diagnostics.player";
import { PlayerDiagnosticsSchema } from "@/schemas/player.schema";
import { playbackAtoms } from "@/store/player.store";
import type { PlayerDiagnostics } from "@/types/player/diagnostics";

const report: PlayerDiagnostics = {
  active: true,
  preparation: "ready",
  startup: { windowCreatedAtMs: 0, nativeReadyAtMs: 123.4, frontendReadyAtMs: 156.7 },
  decoder: "h264",
  hwdec: "d3d11va",
  videoOutput: "gpu-next",
  gpuContext: "d3d11",
  audioOutput: "wasapi",
};

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  playbackAtoms.hasFile.set(true);
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(report);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

function showDiagnostics() {
  return render(
    <QueryClientProvider client={client}>
      <DiagnosticsOverlay />
    </QueryClientProvider>
  );
}

describe("player diagnostic report", () => {
  it("validates the wire boundary and distinguishes absent timing from zero", async () => {
    expect(await getPlayerDiagnostics()).toEqual(report);
    expect(formatPreparationTime(0)).toBe("0.0");
    expect(formatPreparationTime(null)).toBe("-");

    for (const malformed of [
      { ...report, decoder: "https://cdn/private?token=secret" },
      { ...report, audioOutput: "C:\\Users\\private" },
      { ...report, startup: { ...report.startup, nativeReadyAtMs: -1 } },
      { ...report, startup: { ...report.startup, nativeReadyAtMs: Number.POSITIVE_INFINITY } },
      { ...report, preparation: "unknown" },
    ]) {
      mockInvoke.mockResolvedValueOnce(malformed);
      await expect(getPlayerDiagnostics()).rejects.toThrow();
    }

    expect(PlayerDiagnosticsSchema.safeParse({ ...report, decoder: null }).success).toBe(true);
  });

  it("shows actual outputs and preparation milestones with an explicit time origin", async () => {
    showDiagnostics();
    await screen.findByText("wasapi");
    screen.getByText("h264");
    screen.getByText("gpu-next");
    screen.getByText(translate("player.media.diagnostics.preparation"));
    screen.getByText("0.0");
    screen.getByText("156.7");
  });

  it("reports an unavailable snapshot without exposing native errors and allows retry", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("private file path"));
    showDiagnostics();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(translate("player.media.diagnostics.error"));
    expect(screen.queryByText("private file path")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: translate("player.media.diagnostics.retry") })
    );
    await screen.findByText("wasapi");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stops polling and removes retained diagnostic data after the overlay unmounts", async () => {
    vi.useFakeTimers();
    const mounted = showDiagnostics();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mockInvoke.mock.calls.filter(([name]) => name === "player_diagnostics")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockInvoke.mock.calls.filter(([name]) => name === "player_diagnostics")).toHaveLength(2);
    mounted.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(mockInvoke.mock.calls.filter(([name]) => name === "player_diagnostics")).toHaveLength(2);
    expect(client.getQueryData(["player", "diagnostics"])).toBeUndefined();
  });
});
