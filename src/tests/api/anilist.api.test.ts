import { beforeEach, describe, expect, it } from "vitest";

import { AnilistApi } from "@/api/anilist.api";
import type { ApiTransport } from "@/api/transport.api";
import { useSettingsStore } from "@/store/settings.store";

function fakeTransport(resolve: (command: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return resolve(command, args) as T;
    },
  };
  return { calls, transport };
}

beforeEach(() => {
  useSettingsStore.setState({ anilistProxyUrl: null });
});

describe("AnilistApi", () => {
  it("injects the configured proxy into every call", async () => {
    useSettingsStore.setState({ anilistProxyUrl: "socks5://127.0.0.1:10808" });
    const { calls, transport } = fakeTransport(() => []);
    const api = new AnilistApi({ transport });

    await api.getLists(7);

    expect(calls).toEqual([
      {
        command: "get_anilist_lists",
        args: {
          userId: 7,
          proxyUrl: "socks5://127.0.0.1:10808",
          proxy_url: "socks5://127.0.0.1:10808",
        },
      },
    ]);
  });

  it("trims the login token", async () => {
    const { calls, transport } = fakeTransport(() => ({ id: 1, name: "u" }));
    const api = new AnilistApi({ transport });

    await api.login("  abc  ");

    expect(calls[0]).toMatchObject({ command: "anilist_login" });
    expect(calls[0]?.args).toMatchObject({ token: "abc" });
  });
});
