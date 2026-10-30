import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KONAMI_CODES, KONAMI_TIMEOUT_MS } from "@/config/sequence.config";
import { isTextEntryTarget } from "@/lib/filterHotkeys.utils";
import { subscribeSequence } from "@/lib/sequenceHotkeys.utils";

function press(code: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
}

function subscribe(onMatch: () => void): () => void {
  return subscribeSequence(window, {
    sequence: { codes: KONAMI_CODES, timeoutMs: KONAMI_TIMEOUT_MS },
    ignore: (event) => isTextEntryTarget(event.target),
    onMatch,
  });
}

function pressAll(codes: readonly string[]): void {
  for (const code of codes) press(code);
}

describe("subscribeSequence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires on the complete konami code", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    pressAll(KONAMI_CODES);

    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("requires the whole sequence again after a match", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);
    const last = KONAMI_CODES.at(-1);

    pressAll(KONAMI_CODES);
    pressAll(KONAMI_CODES.slice(0, -1));
    expect(onMatch).toHaveBeenCalledTimes(1);

    if (last) press(last);
    expect(onMatch).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("reuses a repeated first key instead of resetting", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    pressAll(["ArrowUp", "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"]);
    pressAll(KONAMI_CODES.slice(4));

    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("resets progress on an unrelated key", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    pressAll(KONAMI_CODES.slice(0, 5));
    press("KeyX");
    pressAll(KONAMI_CODES.slice(5));
    expect(onMatch).not.toHaveBeenCalled();

    pressAll(KONAMI_CODES);
    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps progress while keys arrive inside the timeout", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    pressAll(KONAMI_CODES.slice(0, 4));
    vi.advanceTimersByTime(KONAMI_TIMEOUT_MS - 100);
    pressAll(KONAMI_CODES.slice(4));

    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("drops progress after the timeout", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    pressAll(KONAMI_CODES.slice(0, 4));
    vi.advanceTimersByTime(KONAMI_TIMEOUT_MS + 50);
    pressAll(KONAMI_CODES.slice(4));
    expect(onMatch).not.toHaveBeenCalled();

    pressAll(KONAMI_CODES);
    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("ignores repeated and modified keys without breaking progress", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    press("ArrowUp");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp", repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp", ctrlKey: true }));
    pressAll(KONAMI_CODES.slice(1));

    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("ignores keys typed into text entries", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    for (const code of KONAMI_CODES) press(code, input);
    expect(onMatch).not.toHaveBeenCalled();

    pressAll(KONAMI_CODES);
    expect(onMatch).toHaveBeenCalledTimes(1);

    unsubscribe();
    input.remove();
  });

  it("resets progress when the window loses focus", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    pressAll(KONAMI_CODES.slice(0, 5));
    window.dispatchEvent(new Event("blur"));
    pressAll(KONAMI_CODES.slice(5));
    expect(onMatch).not.toHaveBeenCalled();

    pressAll(KONAMI_CODES);
    expect(onMatch).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops observing after unsubscribe", () => {
    const onMatch = vi.fn();
    const unsubscribe = subscribe(onMatch);

    unsubscribe();
    pressAll(KONAMI_CODES);

    expect(onMatch).not.toHaveBeenCalled();
  });
});
