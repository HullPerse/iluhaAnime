import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { READER_BOTTOM_BAR_HIDE_MS, useReaderBottomBar } from "@/hooks/manga/reader/bottomBar.hook";

afterEach(() => {
  vi.useRealTimers();
});

it("hides after inactivity, reveals again, and stays while hovered or pinned", () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(
    ({ always, pinned }: { always: boolean; pinned: boolean }) =>
      useReaderBottomBar({ always, pinned }),
    { initialProps: { always: false, pinned: false } }
  );

  expect(result.current.shown).toBe(true);
  act(() => vi.advanceTimersByTime(READER_BOTTOM_BAR_HIDE_MS));
  expect(result.current.shown).toBe(false);
  act(() => result.current.reveal());
  expect(result.current.shown).toBe(true);
  act(() => result.current.hold());
  act(() => vi.advanceTimersByTime(READER_BOTTOM_BAR_HIDE_MS * 2));
  expect(result.current.shown).toBe(true);
  act(() => result.current.release());
  act(() => vi.advanceTimersByTime(READER_BOTTOM_BAR_HIDE_MS));
  expect(result.current.shown).toBe(false);

  rerender({ always: true, pinned: false });
  expect(result.current.shown).toBe(true);
  act(() => vi.advanceTimersByTime(READER_BOTTOM_BAR_HIDE_MS * 2));
  expect(result.current.shown).toBe(true);

  rerender({ always: false, pinned: true });
  expect(result.current.shown).toBe(true);
  act(() => vi.advanceTimersByTime(READER_BOTTOM_BAR_HIDE_MS * 2));
  expect(result.current.shown).toBe(true);
  unmount();
});
