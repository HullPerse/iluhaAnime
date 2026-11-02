import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isConnectivityError,
  networkAtoms,
  noteNetworkFailure,
  noteNetworkSuccess,
  probeNetwork,
} from "@/lib/core/networkHealth.utils";

beforeEach(() => {
  noteNetworkSuccess();
  networkAtoms.checking.set(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isConnectivityError", () => {
  it("recognises transport-level failures", () => {
    expect(isConnectivityError(new Error("error sending request for url: dns error"))).toBe(true);
    expect(isConnectivityError("operation timed out")).toBe(true);
    expect(isConnectivityError(new Error("error trying to connect: connection refused"))).toBe(
      true
    );
    expect(isConnectivityError(new Error("proxy connect error"))).toBe(true);
  });

  it("leaves HTTP and domain errors alone", () => {
    expect(isConnectivityError(new Error("status 403"))).toBe(false);
    expect(isConnectivityError(new Error("AniList rate limit"))).toBe(false);
    expect(isConnectivityError(new Error("this voice-over has no playable sources"))).toBe(false);
  });
});

describe("network reachability", () => {
  it("requires two failures inside the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    noteNetworkFailure(new Error("dns error"));
    expect(networkAtoms.reachable.get()).toBe(true);

    noteNetworkFailure(new Error("dns error"));
    expect(networkAtoms.reachable.get()).toBe(false);
  });

  it("forgets failures that are far apart", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    noteNetworkFailure(new Error("dns error"));

    vi.setSystemTime(1_000 + 60_000);
    noteNetworkFailure(new Error("dns error"));

    expect(networkAtoms.reachable.get()).toBe(true);
  });

  it("ignores an HTTP error even when it repeats", () => {
    noteNetworkFailure(new Error("status 500"));
    noteNetworkFailure(new Error("status 500"));

    expect(networkAtoms.reachable.get()).toBe(true);
  });

  it("recovers on any answered request", () => {
    noteNetworkFailure(new Error("dns error"));
    noteNetworkFailure(new Error("dns error"));
    expect(networkAtoms.reachable.get()).toBe(false);

    noteNetworkSuccess();
    expect(networkAtoms.reachable.get()).toBe(true);
  });

  it("recovers through the probe and reports a dead route", async () => {
    networkAtoms.reachable.set(false);
    await expect(probeNetwork(async () => true)).resolves.toBe(true);
    expect(networkAtoms.reachable.get()).toBe(true);

    await expect(probeNetwork(async () => false)).resolves.toBe(false);
    expect(networkAtoms.reachable.get()).toBe(false);
    expect(networkAtoms.checking.get()).toBe(false);
  });

  it("does not start a second probe while one is running", async () => {
    let release: () => void = () => undefined;
    const first = probeNetwork(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        })
    );

    await expect(probeNetwork(async () => false)).resolves.toBe(true);
    release();
    await expect(first).resolves.toBe(true);
  });
});
