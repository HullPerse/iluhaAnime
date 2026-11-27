import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useReaderAutoScroll } from "@/hooks/manga/reader/autoScroll.hook";
import { mangaAutoRunning } from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";

afterEach(() => {
  document.querySelectorAll("dialog").forEach((node) => node.remove());
  mangaAutoRunning.set(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  settingsAtoms.mangaAutoHold.set(false);
  settingsAtoms.mangaAutoSpeed.set(1);
  settingsAtoms.mangaAutoInterval.set(10);
  settingsAtoms.mangaAutoNext.set(false);
  settingsAtoms.keybindOverrides.set({});
});

function setup({ end = false, scrollHeight = 200 }: { end?: boolean; scrollHeight?: number } = {}) {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  settingsAtoms.mangaAutoSpeed.set(1);
  settingsAtoms.mangaAutoInterval.set(2);
  const node = document.createElement("dialog");
  const scroll = document.createElement("div");
  scroll.dataset.readerScroll = "";
  Object.defineProperties(scroll, {
    clientHeight: { value: 200, configurable: true },
    scrollHeight: { value: scrollHeight, configurable: true },
  });
  const image = document.createElement("img");
  image.dataset.mangaImage = "0";
  let loaded = true;
  Object.defineProperties(image, {
    complete: { get: () => loaded },
    naturalWidth: { get: () => (loaded ? 100 : 0) },
  });
  node.append(scroll, image);
  document.body.append(node);
  const step = vi.fn();
  const next = vi.fn();
  const hook = renderHook(
    ({ blocked, ready }) =>
      useReaderAutoScroll({ current: node }, { blocked, ready, end, step, next }),
    { initialProps: { blocked: false, ready: true } }
  );

  return {
    ...hook,
    node,
    scroll,
    step,
    next,
    setLoaded: (value: boolean) => {
      loaded = value;
    },
  };
}

it("waits for ready pages, turns after the configured interval, and stops for wheel input or an overlay", () => {
  const test = setup();
  act(() => test.result.current.toggle());
  test.rerender({ blocked: false, ready: false });
  act(() => vi.advanceTimersByTime(3000));
  expect(test.step).not.toHaveBeenCalled();
  test.rerender({ blocked: false, ready: true });
  act(() => vi.advanceTimersByTime(2100));
  expect(test.step).toHaveBeenCalledTimes(1);
  act(() => test.node.dispatchEvent(new WheelEvent("wheel")));
  expect(test.result.current.running).toBe(false);
  act(() => test.result.current.toggle());
  test.rerender({ blocked: true, ready: true });
  expect(test.result.current.running).toBe(false);
  test.unmount();
});

it("stops at the end by default, supports held Space, and cancels animation frames on unmount", () => {
  const test = setup({ end: true });
  settingsAtoms.mangaAutoHold.set(true);
  act(() =>
    test.node.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }))
  );
  expect(test.result.current.running).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
  expect(test.result.current.running).toBe(false);
  act(() => test.result.current.toggle());
  act(() => vi.advanceTimersByTime(2200));
  expect(test.result.current.running).toBe(false);
  expect(test.next).not.toHaveBeenCalled();
  expect(test.step).not.toHaveBeenCalled();
  test.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("starts from the auto key when focus is outside the reader dialog", () => {
  const test = setup();
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })));
  expect(test.result.current.running).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
  test.unmount();
});

it("keeps moving through a tall page without stopping when an image is still loading", () => {
  const test = setup({ scrollHeight: 2000 });
  test.setLoaded(false);
  act(() => test.result.current.toggle());
  act(() => vi.advanceTimersByTime(300));
  expect(test.scroll.scrollTop).toBe(0);
  test.setLoaded(true);
  act(() => vi.advanceTimersByTime(600));
  const before = test.scroll.scrollTop;

  expect(before).toBeGreaterThan(0);
  test.setLoaded(false);
  act(() => vi.advanceTimersByTime(600));
  expect(test.scroll.scrollTop).toBeGreaterThan(before);
  act(() => test.result.current.toggle());
  test.unmount();
});
