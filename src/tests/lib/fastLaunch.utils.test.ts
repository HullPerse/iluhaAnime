import { describe, expect, it } from "vitest";

import { readFastLaunch } from "@/lib/core/system/fastLaunch.utils";

const stored = (fastLaunch: unknown): string => {
  return JSON.stringify({ f: 1, store: "settings", sv: 45, ts: 1, data: { fastLaunch } });
};

describe("readFastLaunch", () => {
  it("reads the persisted flag and treats missing or broken storage as off", () => {
    expect(readFastLaunch()).toBe(false);
    localStorage.setItem("iluha.v1.settings", stored(true));
    expect(readFastLaunch()).toBe(true);
    localStorage.setItem("iluha.v1.settings", stored(false));
    expect(readFastLaunch()).toBe(false);
    localStorage.setItem("iluha.v1.settings", "{broken");
    expect(readFastLaunch()).toBe(false);
  });
});
