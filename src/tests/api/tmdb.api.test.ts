import { beforeEach, describe, expect, it } from "vitest";

import { TmdbApi } from "@/api/tmdb.api";
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
  useSettingsStore.setState({ tmdbKeySet: false, tmdbProxyUrl: null });
});

describe("TmdbApi", () => {
  it("sends the empty key placeholder with the store proxy", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:7890" });
    const { calls, transport } = fakeTransport(() => []);
    const api = new TmdbApi({ transport });

    await api.getDetails(1, "movie");

    expect(calls).toEqual([
      {
        command: "get_tmdb_details",
        args: {
          apiKey: "",
          tmdbId: 1,
          mediaType: "movie",
          proxyUrl: "http://127.0.0.1:7890",
        },
      },
    ]);
  });
});
