import { describe, expect, it } from "vitest";

import {
  LOADING_TIMEOUT_MS,
  shouldShowEmptyPlayer,
  shouldShowLoadingSpinner,
} from "@/lib/player/loading.utils";

describe("player/loading overlay", () => {
  it("shows the black ground while no file is open", () => {
    expect(shouldShowEmptyPlayer(false, false, false, false)).toBe(true);
  });

  it("shows the black ground while the first file is loading", () => {
    expect(shouldShowEmptyPlayer(true, true, false, false)).toBe(true);
  });

  it("hides the black ground once the first frame is in", () => {
    expect(shouldShowEmptyPlayer(true, false, false, true)).toBe(false);
  });

  it("keeps the native frame on switches instead of the black ground", () => {
    expect(shouldShowEmptyPlayer(true, true, false, true)).toBe(false);
  });

  it("prefers the failed overlay over the loading ground", () => {
    expect(shouldShowEmptyPlayer(false, false, true, false)).toBe(false);
    expect(shouldShowEmptyPlayer(true, true, true, true)).toBe(false);
  });

  it("keeps the loading fallback timeout at five seconds", () => {
    expect(LOADING_TIMEOUT_MS).toBe(5000);
  });
});

describe("player/loading spinner", () => {
  it("spins in the corner only while switching between shown frames", () => {
    expect(shouldShowLoadingSpinner(true, true, false, true)).toBe(true);
  });

  it("stays off on the first load, on ready video, and on failure", () => {
    expect(shouldShowLoadingSpinner(true, true, false, false)).toBe(false);
    expect(shouldShowLoadingSpinner(true, false, false, true)).toBe(false);
    expect(shouldShowLoadingSpinner(false, false, false, false)).toBe(false);
    expect(shouldShowLoadingSpinner(true, true, true, true)).toBe(false);
  });
});
