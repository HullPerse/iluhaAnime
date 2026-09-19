import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnimatedNumber } from "@/components/shared/animatedNumber.component";
import { useSettingsStore } from "@/store/settings.store";

const FRAME_MS = 50;

let frameCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
  frameCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockReturnValue(0);
  useSettingsStore.setState({ animateCounters: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advance(ms: number) {
  const pending = [...frameCallbacks];
  frameCallbacks = [];
  act(() => {
    pending.forEach((callback) => callback(ms));
  });
}

describe("AnimatedNumber", () => {
  it("shows the exact value while the setting is off", () => {
    render(<AnimatedNumber value={1234} format={(value) => `${Math.round(value)} B`} />);
    expect(screen.getByText("1234 B")).toBeDefined();
    expect(frameCallbacks).toHaveLength(0);
  });

  it("eases towards the target when the setting is on", () => {
    act(() => useSettingsStore.setState({ animateCounters: true }));
    const { rerender } = render(
      <AnimatedNumber value={0} format={(value) => `${Math.round(value)}`} />
    );
    rerender(<AnimatedNumber value={100} format={(value) => `${Math.round(value)}`} />);
    expect(frameCallbacks).toHaveLength(1);

    advance(FRAME_MS * 2);
    const middle = Number(screen.getByText(/^\d+$/).textContent);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(100);
  });

  it("lands on the target once the duration elapses", () => {
    act(() => useSettingsStore.setState({ animateCounters: true }));
    const { rerender } = render(
      <AnimatedNumber value={10} format={(value) => `${Math.round(value)}`} />
    );
    rerender(<AnimatedNumber value={50} format={(value) => `${Math.round(value)}`} />);
    advance(400);

    expect(screen.getByText("50")).toBeDefined();
    expect(frameCallbacks).toHaveLength(0);
  });

  it("jumps to the new value when the setting turns off mid-flight", () => {
    useSettingsStore.setState({ animateCounters: true });
    const { rerender } = render(
      <AnimatedNumber value={0} format={(value) => `${Math.round(value)}`} />
    );
    rerender(<AnimatedNumber value={200} format={(value) => `${Math.round(value)}`} />);
    advance(FRAME_MS);
    act(() => useSettingsStore.setState({ animateCounters: false }));

    expect(screen.getByText("200")).toBeDefined();
  });
});
