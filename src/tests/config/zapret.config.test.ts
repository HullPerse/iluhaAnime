import { describe, expect, it } from "vitest";

import {
  ZAPRET_ALL_IPS,
  ZAPRET_HOSTLIST,
  ZAPRET_SAFE_IPS,
  zapretLocalEndpoint,
} from "@/config/settings/zapret.config";

describe("zapret config", () => {
  it("has no duplicate hostnames or addresses", () => {
    expect(new Set(ZAPRET_HOSTLIST).size).toBe(ZAPRET_HOSTLIST.length);
    expect(new Set(ZAPRET_ALL_IPS).size).toBe(ZAPRET_ALL_IPS.length);
  });

  it("keeps every safe IP in the full list", () => {
    for (const ip of ZAPRET_SAFE_IPS) {
      expect(ZAPRET_ALL_IPS).toContain(ip);
    }
  });

  it("covers the app's core hosts", () => {
    for (const host of [
      "graphql.anilist.co",
      "shikimori.io",
      "api.tenrai.org",
      "graphql.animethemes.moe",
      "animelib.org",
      "kodikplayer.com",
      "nyaa.si",
      "rutracker.org",
      "github.com",
    ]) {
      expect(ZAPRET_HOSTLIST).toContain(host);
    }
  });

  it("builds the local endpoint from the configured port", () => {
    expect(zapretLocalEndpoint(11200)).toBe("127.0.0.1:11200");
  });
});
