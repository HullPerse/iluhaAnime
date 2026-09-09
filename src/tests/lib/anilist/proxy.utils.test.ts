import { describe, expect, it } from "vitest";

import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";

describe("anilistProxyArgs", () => {
  it("returns no keys without a proxy", () => {
    expect(anilistProxyArgs(null)).toEqual({});
  });

  it("returns no keys for a blank proxy", () => {
    expect(anilistProxyArgs("   ")).toEqual({});
  });

  it("returns both casings trimmed for a set proxy", () => {
    expect(anilistProxyArgs("  http://127.0.0.1:7890 ")).toEqual({
      proxyUrl: "http://127.0.0.1:7890",
      proxy_url: "http://127.0.0.1:7890",
    });
  });
});
