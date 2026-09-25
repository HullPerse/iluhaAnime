import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight, tauriTransport } from "@/api/transport.api";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
  resetTransportInflight();
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
