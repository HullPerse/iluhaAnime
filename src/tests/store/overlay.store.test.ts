import { describe, expect, it, vi } from "vitest";

import { useOverlayStore } from "@/store/overlay.store";

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
  document.body.dispatchEvent(event);
  return event;
}

describe("useOverlayStore", () => {
  it("registers on top of the stack and removes itself on unregister", () => {
    const unregister = useOverlayStore.getState().register(vi.fn());
    expect(useOverlayStore.getState().entries).toHaveLength(1);
    unregister();
    expect(useOverlayStore.getState().entries).toHaveLength(0);
  });

  it("dismisses only the last registered overlay on Escape", () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const unregisterLower = useOverlayStore.getState().register(lower);
    const unregisterUpper = useOverlayStore.getState().register(upper);
    pressEscape();
    expect(lower).not.toHaveBeenCalled();
    expect(upper).toHaveBeenCalledTimes(1);
    unregisterUpper();
    unregisterLower();
  });

  it("reaches the overlay below once the top one is gone", () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const unregisterLower = useOverlayStore.getState().register(lower);
    const unregisterUpper = useOverlayStore.getState().register(upper);
    unregisterUpper();
    pressEscape();
    expect(lower).toHaveBeenCalledTimes(1);
    expect(upper).not.toHaveBeenCalled();
    unregisterLower();
  });

  it("leaves Escape alone when the top overlay renders its own dismissal", () => {
    const below = vi.fn();
    const unregisterBelow = useOverlayStore.getState().register(below);
    const unregisterDialog = useOverlayStore.getState().register(null);
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
    expect(below).not.toHaveBeenCalled();
    unregisterDialog();
    unregisterBelow();
  });

  it("stops propagation for a stack-owned overlay so dialogs below stay open", () => {
    const documentListener = vi.fn();
    const unregisterDialog = useOverlayStore.getState().register(null);
    const unregisterOverlay = useOverlayStore.getState().register(vi.fn());
    document.addEventListener("keydown", documentListener);

    pressEscape();
    expect(documentListener).not.toHaveBeenCalled();

    unregisterOverlay();
    pressEscape();
    expect(documentListener).toHaveBeenCalledTimes(1);

    document.removeEventListener("keydown", documentListener);
    unregisterDialog();
  });

  it("ignores keys other than Escape", () => {
    const dismiss = vi.fn();
    const unregister = useOverlayStore.getState().register(dismiss);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true })
    );
    expect(dismiss).not.toHaveBeenCalled();
    unregister();
  });

  it("reports whether dismissTop had a stack-owned overlay to close", () => {
    const dismiss = vi.fn();
    const unregister = useOverlayStore.getState().register(dismiss);
    expect(useOverlayStore.getState().dismissTop()).toBe(true);
    expect(dismiss).toHaveBeenCalledTimes(1);
    unregister();
    expect(useOverlayStore.getState().dismissTop()).toBe(false);
  });

  it("keeps a single window listener while overlays come and go", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const unregisterFirst = useOverlayStore.getState().register(null);
    const unregisterSecond = useOverlayStore.getState().register(null);
    expect(addSpy).toHaveBeenCalledTimes(1);
    unregisterFirst();
    expect(removeSpy).not.toHaveBeenCalled();
    unregisterSecond();
    expect(removeSpy).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
