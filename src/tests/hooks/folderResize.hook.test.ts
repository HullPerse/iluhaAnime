import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FOLDER_RESIZE_STEP } from "@/config/player/folders.config";
import { useBottomResize } from "@/hooks/folderResize.hook";

function fireMouseEvent(type: "mousemove" | "mouseup", clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { clientY }));
  });
}

describe("useBottomResize", () => {
  const setup = (
    height: number | undefined,
    onResizeEnd: (height: number) => void,
    options?: {
      getStartHeight?: () => number | undefined;
    }
  ) =>
    renderHook(() =>
      useBottomResize({
        height,
        minHeight: 48,
        maxHeight: 800,
        onResizeEnd,
        getStartHeight: options?.getStartHeight,
      })
    );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("commits the dragged height on mouseup only", () => {
    const onResizeEnd = vi.fn();
    const { result } = setup(200, onResizeEnd);

    act(() => {
      result.current.beginDrag({
        clientY: 100,
        preventDefault: () => {},
      });
    });
    expect(result.current.dragging).toBe(true);
    expect(result.current.previewHeight).toBe(200);
    expect(onResizeEnd).not.toHaveBeenCalled();

    fireMouseEvent("mousemove", 150);
    expect(result.current.previewHeight).toBe(250);
    expect(onResizeEnd).not.toHaveBeenCalled();

    fireMouseEvent("mouseup", 200);
    expect(result.current.dragging).toBe(false);
    expect(result.current.previewHeight).toBeNull();
    expect(onResizeEnd).toHaveBeenCalledWith(300);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it("clamps the dragged height between minHeight and maxHeight", () => {
    const onResizeEnd = vi.fn();
    const { result } = setup(200, onResizeEnd);

    act(() => {
      result.current.beginDrag({ clientY: 100, preventDefault: () => {} });
    });
    fireMouseEvent("mouseup", 100 - 1000);
    expect(onResizeEnd).toHaveBeenLastCalledWith(48);

    act(() => {
      result.current.beginDrag({ clientY: 100, preventDefault: () => {} });
    });
    fireMouseEvent("mouseup", 100 + 2000);
    expect(onResizeEnd).toHaveBeenLastCalledWith(800);
  });

  it("starts a drag from the measured rendered height, not the persisted one", () => {
    const onResizeEnd = vi.fn();
    const getStartHeight = vi.fn(() => 150);
    const { result } = setup(200, onResizeEnd, { getStartHeight });

    act(() => {
      result.current.beginDrag({ clientY: 100, preventDefault: () => {} });
    });
    expect(result.current.previewHeight).toBe(150);
    fireMouseEvent("mouseup", 100);
    expect(onResizeEnd).toHaveBeenCalledWith(150);
  });

  it("falls back to minHeight when nothing is measured or persisted", () => {
    const onResizeEnd = vi.fn();
    const { result } = setup(undefined, onResizeEnd);

    act(() => {
      result.current.beginDrag({ clientY: 500, preventDefault: () => {} });
    });
    fireMouseEvent("mouseup", 500);
    expect(onResizeEnd).toHaveBeenCalledWith(48);
  });

  it("adjusts from the committed height via keyboard and clamps", () => {
    const onResizeEnd = vi.fn();
    const { result } = setup(200, onResizeEnd);

    act(() => result.current.adjust(-FOLDER_RESIZE_STEP));
    expect(onResizeEnd).toHaveBeenLastCalledWith(180);

    act(() => result.current.adjust(-FOLDER_RESIZE_STEP * 20));
    expect(onResizeEnd).toHaveBeenLastCalledWith(48);

    act(() => result.current.adjust(FOLDER_RESIZE_STEP * 100));
    expect(onResizeEnd).toHaveBeenLastCalledWith(800);
  });
});
