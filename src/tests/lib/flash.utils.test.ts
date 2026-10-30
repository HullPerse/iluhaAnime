import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flashTarget, TARGET_FLASH_MS } from "@/lib/flash.utils";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("flashTarget", () => {
  it("adds the shared class and removes it after the flash window", () => {
    const node = document.createElement("div");
    flashTarget(node);
    expect(node.classList.contains("target-flash")).toBe(true);
    vi.advanceTimersByTime(TARGET_FLASH_MS - 1);
    expect(node.classList.contains("target-flash")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(node.classList.contains("target-flash")).toBe(false);
  });

  it("removes the class when the returned cleanup runs early", () => {
    const node = document.createElement("div");
    const cleanup = flashTarget(node);
    cleanup();
    expect(node.classList.contains("target-flash")).toBe(false);
    vi.advanceTimersByTime(TARGET_FLASH_MS);
    expect(node.classList.contains("target-flash")).toBe(false);
  });
});
