import { describe, expect, it } from "vitest";

import { pingBarCount } from "@/lib/session/ping.utils";

describe("pingBarCount", () => {
  it("draws an empty meter without a sample", () => {
    expect(pingBarCount(null)).toBe(0);
    expect(pingBarCount(undefined)).toBe(0);
    expect(pingBarCount(Number.NaN)).toBe(0);
  });

  it("fills every bar below the first threshold", () => {
    expect(pingBarCount(0)).toBe(5);
    expect(pingBarCount(29)).toBe(5);
  });

  it("drops one bar per threshold crossed", () => {
    expect(pingBarCount(30)).toBe(4);
    expect(pingBarCount(59)).toBe(4);
    expect(pingBarCount(60)).toBe(3);
    expect(pingBarCount(119)).toBe(3);
    expect(pingBarCount(120)).toBe(2);
    expect(pingBarCount(249)).toBe(2);
  });

  it("keeps a single bar at and above the last threshold", () => {
    expect(pingBarCount(250)).toBe(1);
    expect(pingBarCount(900)).toBe(1);
  });
});
