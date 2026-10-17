import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnimatedNumber } from "@/components/shared/animatedNumber.component";
import { settingsAtoms } from "@/store/settings.store";

interface FrameHarness {
  frame: (now: number) => void;
}

function installFrameHarness(): FrameHarness {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (step: FrameRequestCallback): number => {
    nextId += 1;
    callbacks.set(nextId, step);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    callbacks.delete(id);
  });
  return {
    frame: (now: number): void => {
      const pending = Array.from(callbacks);
      for (const [id, step] of pending) {
        callbacks.delete(id);
        step(now);
      }
    },
  };
}

function format(value: number): string {
  return value.toFixed(0);
}

beforeEach(() => {
  vi.spyOn(performance, "now").mockReturnValue(1000);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AnimatedNumber", () => {
  it("shows the target immediately while animations are off", () => {
    const view = render(<AnimatedNumber value={10} format={format} />);
    expect(view.container.textContent).toBe("10");
    view.rerender(<AnimatedNumber value={25} format={format} />);
    expect(view.container.textContent).toBe("25");
  });

  it("tweens towards the new value frame by frame while animations are on", () => {
    settingsAtoms.animateCounters.set(true);
    const frames = installFrameHarness();
    const view = render(<AnimatedNumber value={0} format={format} />);
    expect(view.container.textContent).toBe("0");
    view.rerender(<AnimatedNumber value={100} format={format} />);
    expect(view.container.textContent).toBe("0");
    act(() => {
      frames.frame(1200);
    });
    expect(view.container.textContent).toBe("50");
    act(() => {
      frames.frame(1400);
    });
    expect(view.container.textContent).toBe("100");
  });

  it("snaps to the target when animations turn off mid-tween and recovers when they return", () => {
    settingsAtoms.animateCounters.set(true);
    const frames = installFrameHarness();
    const view = render(<AnimatedNumber value={0} format={format} />);
    view.rerender(<AnimatedNumber value={100} format={format} />);
    act(() => {
      frames.frame(1200);
    });
    expect(view.container.textContent).toBe("50");
    act(() => {
      settingsAtoms.animateCounters.set(false);
    });
    expect(view.container.textContent).toBe("100");
    act(() => {
      settingsAtoms.animateCounters.set(true);
    });
    expect(view.container.textContent).toBe("100");
    view.rerender(<AnimatedNumber value={150} format={format} />);
    expect(view.container.textContent).toBe("100");
    act(() => {
      frames.frame(1400);
    });
    expect(view.container.textContent).toBe("150");
  });
});
