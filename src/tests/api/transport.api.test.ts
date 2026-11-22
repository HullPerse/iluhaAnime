import { mockConvertFileSrc, mockInvoke as invokeMock } from "@/tests/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTransportStats,
  resetTransportInflight,
  resetTransportStats,
  tauriTransport,
} from "@/api/transport.api";
import { recordIpcCacheHit } from "@/lib/core/system/ipcStats.utils";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
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
    expect(getTransportStats()).toEqual([
      expect.objectContaining({
        command: "get_anilist_lists",
        invokes: 1,
        dedupHits: 1,
        errors: 0,
      }),
    ]);
  });

  it("issues a new invoke after the first settles", async () => {
    invokeMock.mockResolvedValue("ok");
    await tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    await tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("records duration, response bytes and errors", async () => {
    invokeMock.mockResolvedValueOnce("ok");
    await tauriTransport.call<string>("get_anilist_lists", { userId: 7 });
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    await expect(tauriTransport.call<string>("get_anilist_lists", { userId: 8 })).rejects.toThrow();

    const [stat] = getTransportStats();

    expect(stat).toEqual(
      expect.objectContaining({
        command: "get_anilist_lists",
        invokes: 2,
        errors: 1,
        responseBytes: 2,
        durationsMs: [expect.any(Number), expect.any(Number)],
      })
    );
    expect(stat?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("records page cache hits separately from invokes", () => {
    recordIpcCacheHit("manga_page_fetch");

    expect(getTransportStats()).toEqual([
      expect.objectContaining({
        command: "manga_page_fetch",
        invokes: 0,
        cacheHits: 1,
      }),
    ]);
  });
});
