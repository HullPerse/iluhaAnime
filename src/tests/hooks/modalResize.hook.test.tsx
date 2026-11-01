import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODAL_RESIZE_DURATION, useModalResize } from "@/hooks/modalResize.hook";

const size = { width: 0, height: 0 };
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

let resizeCallback: ResizeObserverCallback | null = null;
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let now = 0;

const rafMock = vi.fn((callback: FrameRequestCallback): number => {
  const id = nextFrameId;
  nextFrameId += 1;
  frames.set(id, callback);
  return id;
});

const cancelRafMock = vi.fn((id: number): void => {
  frames.delete(id);
});

function Harness({ enabled }: { enabled: boolean }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useModalResize(element, enabled);
  return <div data-testid="popup" ref={setElement} />;
}

function DelayedHarness({ enabled }: { enabled: boolean }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);
  useModalResize(element, enabled);
  return (
    <div>
      <button type="button" onClick={() => setMounted(true)}>
        mount
      </button>
      {mounted && <div data-testid="popup" ref={setElement} />}
    </div>
  );
}

const setSize = (width: number, height: number): void => {
  size.width = width;
  size.height = height;
};

const triggerResize = (): void => {
  act(() => {
    resizeCallback?.([], {} as ResizeObserver);
  });
};

const runFrame = (delta: number): void => {
  now += delta;
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => {
    for (const frameCallback of callbacks) frameCallback(now);
  });
};

const pendingFrames = (): number => frames.size;

beforeEach(() => {
  size.width = 320;
  size.height = 200;
  resizeCallback = null;
  frames = new Map<number, FrameRequestCallback>();
  nextFrameId = 1;
  now = 0;
  rafMock.mockClear();
  cancelRafMock.mockClear();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => size.width,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => size.height,
  });
  vi.stubGlobal("requestAnimationFrame", rafMock);
  vi.stubGlobal("cancelAnimationFrame", cancelRafMock);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 });
});

afterEach(() => {
  cleanup();
  restoreProperty(HTMLElement.prototype, "offsetWidth", originalWidth);
  restoreProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
  restoreProperty(window, "innerWidth", originalInnerWidth);
  restoreProperty(window, "innerHeight", originalInnerHeight);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const restoreProperty = (
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined
): void => {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
};

describe("useModalResize", () => {
  it("does not animate the size the popup already settled at", () => {
    render(<Harness enabled />);

    triggerResize();

    expect(rafMock).not.toHaveBeenCalled();
  });

  it("attaches the observer when the element mounts after the first render", () => {
    render(<DelayedHarness enabled />);
    expect(resizeCallback).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "mount" }));

    expect(resizeCallback).not.toBeNull();
    setSize(480, 300);
    triggerResize();
    expect(rafMock).toHaveBeenCalledTimes(1);

    runFrame(0);
    expect(screen.getByTestId("popup").style.width).toBe("320px");

    runFrame(MODAL_RESIZE_DURATION);
    expect(screen.getByTestId("popup").style.width).toBe("");
  });

  it("animates from the old size to the new one and clips the content", () => {
    render(<Harness enabled />);
    const popup = screen.getByTestId("popup");

    setSize(480, 300);
    triggerResize();

    expect(popup.style.overflow).toBe("hidden");
    expect(rafMock).toHaveBeenCalledTimes(1);

    runFrame(0);
    expect(popup.style.width).toBe("320px");
    expect(popup.style.height).toBe("200px");

    runFrame(MODAL_RESIZE_DURATION / 2);
    expect(popup.style.width).toBe("400px");
    expect(popup.style.height).toBe("250px");

    runFrame(MODAL_RESIZE_DURATION / 2);
    expect(popup.style.overflow).toBe("");
  });

  it("applies window-resize changes without animating", () => {
    render(<Harness enabled />);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    setSize(300, 180);
    triggerResize();

    expect(rafMock).not.toHaveBeenCalled();
  });

  it("ignores its own resize callbacks and chains to the settled size", () => {
    render(<Harness enabled />);
    const popup = screen.getByTestId("popup");

    setSize(480, 300);
    triggerResize();
    setSize(520, 340);
    triggerResize();

    expect(rafMock).toHaveBeenCalledTimes(1);

    runFrame(0);
    runFrame(MODAL_RESIZE_DURATION);

    expect(rafMock).toHaveBeenCalledTimes(3);
    expect(pendingFrames()).toBe(1);
    expect(popup.style.overflow).toBe("hidden");

    runFrame(0);
    expect(popup.style.width).toBe("480px");

    runFrame(MODAL_RESIZE_DURATION / 2);
    expect(popup.style.width).toBe("500px");

    runFrame(MODAL_RESIZE_DURATION / 2);
    expect(popup.style.width).toBe("");
    expect(popup.style.overflow).toBe("");
  });

  it("stays inert while the setting is off", () => {
    render(<Harness enabled={false} />);

    setSize(600, 400);
    triggerResize();

    expect(rafMock).not.toHaveBeenCalled();
  });

  it("survives a runtime without ResizeObserver", () => {
    vi.unstubAllGlobals();

    render(<Harness enabled />);

    expect(screen.getByTestId("popup")).toBeDefined();
    expect(rafMock).not.toHaveBeenCalled();
  });

  it("cancels the running animation and restores clipping on unmount", () => {
    const view = render(<Harness enabled />);
    const popup = screen.getByTestId("popup");

    setSize(480, 300);
    triggerResize();
    expect(cancelRafMock).not.toHaveBeenCalled();

    view.unmount();

    expect(cancelRafMock).toHaveBeenCalled();
    expect(popup.style.overflow).toBe("");
  });
});
