import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODAL_RESIZE_DURATION, useModalResize } from "@/hooks/modalResize.hook";

const size = { width: 0, height: 0 };
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

type Listener = () => void;

interface FakeAnimation {
  addEventListener: (type: string, listener: Listener) => void;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
}

let resizeCallback: ResizeObserverCallback | null = null;
let animations: FakeAnimation[] = [];

const animateMock = vi.fn(
  (_keyframes: Keyframe[], _options?: KeyframeAnimationOptions): FakeAnimation => {
    const listeners = new Map<string, Set<Listener>>();
    const animation: FakeAnimation = {
      addEventListener: (type, listener) => {
        const bucket = listeners.get(type) ?? new Set<Listener>();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
      cancel: vi.fn(() => {
        for (const listener of listeners.get("cancel") ?? []) listener();
      }),
      finish: () => {
        for (const listener of listeners.get("finish") ?? []) listener();
      },
    };
    animations.push(animation);
    return animation;
  }
);

function Harness({ enabled }: { enabled: boolean }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useModalResize(element, enabled);
  return <div data-testid="popup" ref={setElement} />;
}

function DelayedHarness({ enabled }: { enabled: boolean }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
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

beforeEach(() => {
  size.width = 320;
  size.height = 200;
  animations = [];
  resizeCallback = null;
  animateMock.mockClear();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => size.width,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => size.height,
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animateMock,
  });
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
  restoreProperty(HTMLElement.prototype, "animate", originalAnimate);
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

    expect(animateMock).not.toHaveBeenCalled();
  });

  it("attaches the observer when the element mounts after the first render", () => {
    render(<DelayedHarness enabled />);
    expect(resizeCallback).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "mount" }));

    expect(resizeCallback).not.toBeNull();
    setSize(480, 300);
    triggerResize();
    expect(animateMock).toHaveBeenCalledTimes(1);
  });

  it("animates from the old size to the new one and clips the content", () => {
    render(<Harness enabled />);
    const popup = screen.getByTestId("popup");

    setSize(480, 300);
    triggerResize();

    expect(animateMock).toHaveBeenCalledWith(
      [
        { width: "320px", height: "200px" },
        { width: "480px", height: "300px" },
      ],
      { duration: MODAL_RESIZE_DURATION, easing: "ease-in-out" }
    );
    expect(popup.style.overflow).toBe("hidden");

    act(() => animations[0].finish());

    expect(popup.style.overflow).toBe("");
  });

  it("applies window-resize changes without animating", () => {
    render(<Harness enabled />);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    setSize(300, 180);
    triggerResize();

    expect(animateMock).not.toHaveBeenCalled();
  });

  it("ignores its own resize callbacks and chains to the settled size", () => {
    render(<Harness enabled />);

    setSize(480, 300);
    triggerResize();
    setSize(520, 340);
    triggerResize();

    expect(animateMock).toHaveBeenCalledTimes(1);

    act(() => animations[0].finish());

    expect(animateMock).toHaveBeenCalledTimes(2);
    expect(animateMock).toHaveBeenLastCalledWith(
      [
        { width: "480px", height: "300px" },
        { width: "520px", height: "340px" },
      ],
      { duration: MODAL_RESIZE_DURATION, easing: "ease-in-out" }
    );
  });

  it("stays inert while the setting is off", () => {
    render(<Harness enabled={false} />);

    setSize(600, 400);
    triggerResize();

    expect(animateMock).not.toHaveBeenCalled();
  });

  it("survives a runtime without ResizeObserver", () => {
    vi.unstubAllGlobals();

    render(<Harness enabled />);

    expect(screen.getByTestId("popup")).toBeDefined();
    expect(animateMock).not.toHaveBeenCalled();
  });

  it("cancels the running animation and restores clipping on unmount", () => {
    const view = render(<Harness enabled />);
    const popup = screen.getByTestId("popup");

    setSize(480, 300);
    triggerResize();
    expect(animations[0].cancel).not.toHaveBeenCalled();

    view.unmount();

    expect(animations[0].cancel).toHaveBeenCalled();
    expect(popup.style.overflow).toBe("");
  });
});
