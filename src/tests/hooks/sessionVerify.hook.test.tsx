import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Unlisten = () => Promise<void>;
type TauriEvent = { payload: unknown };

const tauri = vi.hoisted(() => {
  const calls: Array<{ event: string; handler: (event: TauriEvent) => void }> = [];
  const listen = (
    event: string,
    handler: (event: TauriEvent) => void
  ): Promise<Unlisten> => {
    calls.push({ event, handler });
    return Promise.resolve(async () => undefined);
  };
  return {
    calls,
    listen,
    reset: () => {
      calls.length = 0;
    },
  };
});

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: TauriEvent) => void) =>
    tauri.listen(event, handler),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) =>
    invokeMock(command, args),
}));

import { useSessionDownloadVerify } from "@/hooks/session/verify.hook";
import { useSessionStore } from "@/store/session.store";
import { useSettingsStore } from "@/store/settings.store";
import type { CompatibilityReport, MediaPlanItem } from "@/types/session";

const HOST_IDENTITY = { duration: 1440, sha256: "a".repeat(64), size: 300_000_000 };

const PLAN: MediaPlanItem[] = [
  { identity: HOST_IDENTITY, itemId: "i1", order: 0, sources: [], title: "Episode 1" },
];

function torrentFile(index: number, name: string, size: number) {
  return {
    completed: true,
    exists: true,
    index,
    name,
    priority: "normal" as const,
    progress_bytes: size,
    selected: true,
    size,
  };
}

const FILES = [
  torrentFile(0, "Show/Ep01.mkv", 300_000_000),
  torrentFile(1, "Show/Ep02.mkv", 300_000_100),
];

function emitTorrents(payload: unknown): void {
  const call = tauri.calls.find((entry) => entry.event === "torrents-update");
  if (!call) throw new Error("no torrents-update listener registered");
  call.handler({ payload });
}

function finishedTorrent() {
  return [{ id: 7, finished: true, save_dir: "D:/downloads" }];
}

beforeEach(() => {
  tauri.reset();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "media_identity") return { ...HOST_IDENTITY };
    return undefined;
  });
  useSettingsStore.setState({ language: "en" });
  useSessionStore.setState({ planPaths: {} });
});

function renderVerify(overrides: {
  onMismatch?: (itemId: string, path: string, report: CompatibilityReport) => void;
  onVerified?: (itemId: string, path: string, report: CompatibilityReport) => void;
  enabled?: boolean;
} = {}) {
  const onMismatch = overrides.onMismatch ?? (() => undefined);
  const onVerified = overrides.onVerified ?? (() => undefined);
  return renderHook(() =>
    useSessionDownloadVerify({
      enabled: overrides.enabled ?? true,
      onMismatch,
      onVerified,
      onVerifyDone: () => undefined,
      onVerifyStart: () => undefined,
      plan: PLAN,
    })
  );
}

describe("useSessionDownloadVerify", () => {
  it("hashes the finished file and assigns it on an exact match", async () => {
    const onVerified = vi.fn();
    const { result } = renderVerify({ onVerified });

    await waitFor(() =>
      expect(tauri.calls.some((call) => call.event === "torrents-update")).toBe(true)
    );
    act(() =>
      result.current.trackDownload(7, {
        files: FILES,
        itemId: "i1",
        saveDir: "D:/downloads",
        selected: [0, 1],
        subFolder: null,
      })
    );
    act(() => emitTorrents(finishedTorrent()));

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith("media_identity", {
      path: "D:/downloads/Show/Ep01.mkv",
    });
    expect(onVerified.mock.calls[0][0]).toBe("i1");
    expect(onVerified.mock.calls[0][1]).toBe("D:/downloads/Show/Ep01.mkv");
    expect(onVerified.mock.calls[0][2]).toMatchObject({ level: "exact" });
  });

  it("reports a mismatch instead of assigning the file", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "media_identity")
        return { duration: 1200, sha256: "b".repeat(64), size: 42 };
      return undefined;
    });
    const onVerified = vi.fn();
    const onMismatch = vi.fn();
    const { result } = renderVerify({ onMismatch, onVerified });

    await waitFor(() =>
      expect(tauri.calls.some((call) => call.event === "torrents-update")).toBe(true)
    );
    act(() =>
      result.current.trackDownload(7, {
        files: FILES,
        itemId: "i1",
        saveDir: "D:/downloads",
        selected: [0, 1],
        subFolder: null,
      })
    );
    act(() => emitTorrents(finishedTorrent()));

    await waitFor(() => expect(onMismatch).toHaveBeenCalledTimes(1));
    expect(onVerified).not.toHaveBeenCalled();
    expect(onMismatch.mock.calls[0][2]).toMatchObject({ level: "incompatible" });
  });

  it("ignores unfinished torrents and untracked ids", async () => {
    const onVerified = vi.fn();
    const { result } = renderVerify({ onVerified });

    await waitFor(() =>
      expect(tauri.calls.some((call) => call.event === "torrents-update")).toBe(true)
    );
    act(() =>
      result.current.trackDownload(7, {
        files: FILES,
        itemId: "i1",
        saveDir: "D:/downloads",
        selected: [0, 1],
        subFolder: null,
      })
    );
    act(() => emitTorrents([{ id: 7, finished: false, save_dir: "D:/downloads" }]));
    act(() => emitTorrents([{ id: 9, finished: true, save_dir: "D:/downloads" }]));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onVerified).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "media_identity",
      expect.anything()
    );
  });

  it("does not subscribe when disabled", () => {
    renderVerify({ enabled: false });

    expect(tauri.calls.some((call) => call.event === "torrents-update")).toBe(false);
  });
});
