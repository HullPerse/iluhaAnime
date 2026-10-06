import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTransportStats,
  resetTransportInflight,
  resetTransportStats,
  tauriTransport,
} from "@/api/transport.api";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
  resetTransportInflight();
  resetTransportStats();
});

describe("tauriTransport dedup", () => {
  it("shares one invoke between concurrent identical calls", async () => {
    let release!: (value: string) => void;
    invokeMock.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        release = resolve;
      })
    );
    const first = tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    const second = tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    release("ok");
    await expect(first).resolves.toBe("ok");
    await expect(second).resolves.toBe("ok");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("issues a new invoke after the first settles", async () => {
    invokeMock.mockResolvedValue("ok");
    await tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    await tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("does not dedup payloads over the key limit", async () => {
    invokeMock.mockResolvedValue([]);
    const fileBytes = Array.from({ length: 5000 }, () => 1);
    const first = tauriTransport.call("get_torrent_info_from_file", { fileBytes });
    const second = tauriTransport.call("get_torrent_info_from_file", { fileBytes });
    await first;
    await second;
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

describe("tauriTransport stats", () => {
  it("counts one shared invoke once with its body bytes", async () => {
    let release!: (value: string) => void;
    invokeMock.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        release = resolve;
      })
    );
    const first = tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    const second = tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    release("ok");
    await first;
    await second;
    expect(getTransportStats()).toEqual([
      { command: "get_anilist_lists", invokes: 1, bodyBytes: JSON.stringify({ userId: 7 }).length },
    ]);
  });

  it("accumulates invokes across commands", async () => {
    invokeMock.mockResolvedValue("ok");
    await tauriTransport.call("get_anilist_lists", { userId: 7 });
    await tauriTransport.call("get_anilist_lists", { userId: 7 });
    await tauriTransport.call("check_anilist_auth", {});
    const stats = getTransportStats();
    expect(stats.find((row) => row.command === "get_anilist_lists")).toEqual({
      command: "get_anilist_lists",
      invokes: 2,
      bodyBytes: JSON.stringify({ userId: 7 }).length * 2,
    });
    expect(stats.find((row) => row.command === "check_anilist_auth")?.invokes).toBe(1);
  });
});
