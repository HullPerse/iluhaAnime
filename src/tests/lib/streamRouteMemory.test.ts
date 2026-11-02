import { beforeEach, describe, expect, test } from "vitest";

import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";
import {
  readRememberedRoute,
  rememberStreamRoute,
} from "@/lib/player/streamRouteMemory.utils";

const PROXY = "socks5://127.0.0.1:10808";
const KODIK_URL = "https://cdn.example/kodik/720.m3u8";
const ANIMELIB_URL = "https://cdn.example/animelib/1080.mp4";
const WEEK = 7 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
});

describe("stream route memory", () => {
  test("remembers the route that actually worked", () => {
    expect(readRememberedRoute("Kodik:1", KODIK_URL)).toBeNull();
    rememberStreamRoute("Kodik:1", KODIK_URL, PROXY);
    expect(readRememberedRoute("Kodik:1", KODIK_URL)).toBe("proxy");
  });

  test("keeps separate decisions per player and host", () => {
    rememberStreamRoute("Kodik:1", KODIK_URL, PROXY);
    expect(readRememberedRoute("Kodik:1", "https://other.example/x.m3u8")).toBeNull();
    expect(readRememberedRoute("Animelib:1", KODIK_URL)).toBeNull();
  });

  test("expires an old decision instead of pinning it forever", () => {
    const past = Date.now() - WEEK - 1;
    rememberStreamRoute("Kodik:1", KODIK_URL, PROXY, past);
    expect(readRememberedRoute("Kodik:1", KODIK_URL)).toBeNull();
  });

  test("a remembered direct route overrides the Kodik default", () => {
    rememberStreamRoute("Kodik:1", KODIK_URL, null);
    expect(playbackProxyUrl("Kodik:1", PROXY, KODIK_URL)).toBeNull();
  });

  test("a remembered proxy route overrides the Animelib default", () => {
    rememberStreamRoute("Animelib:1", ANIMELIB_URL, PROXY);
    expect(playbackProxyUrl("Animelib:1", PROXY, ANIMELIB_URL)).toBe(PROXY);
  });
});
