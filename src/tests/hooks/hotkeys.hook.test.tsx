import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HotkeyDef } from "@/lib/hotkeys/chord.hotkeys";
import { useHotkeys } from "@/hooks/hotkeys.hook";

const DEFS: HotkeyDef<"save" | "close">[] = [
  { id: "save", chord: "ctrl+KeyS", repeat: "once" },
  { id: "close", chord: "Escape", repeat: "once" },
];

function press(init: KeyboardEventInit & { code: string }): void {
  window.dispatchEvent(new KeyboardEvent("keydown", init));
}

describe("useHotkeys", () => {
  it("fires the latest callback and cleans up on unmount", () => {
    const first = vi.fn();
    const render = renderHook(({ onAction }) => useHotkeys(DEFS, { onAction }), {
      initialProps: { onAction: first },
    });
    press({ code: "KeyS", ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    render.rerender({ onAction: second });
    press({ code: "Escape", key: "Escape" });
    expect(second).toHaveBeenCalledWith("close", expect.any(KeyboardEvent));
    expect(first).toHaveBeenCalledTimes(1);

    render.unmount();
    press({ code: "KeyS", ctrlKey: true });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stays silent while disabled and resumes after", () => {
    const onAction = vi.fn();
    const render = renderHook(({ enabled }) => useHotkeys(DEFS, { enabled, onAction }), {
      initialProps: { enabled: false },
    });
    press({ code: "Escape", key: "Escape" });
    expect(onAction).not.toHaveBeenCalled();
    render.rerender({ enabled: true });
    press({ code: "Escape", key: "Escape" });
    expect(onAction).toHaveBeenCalledTimes(1);
    render.unmount();
  });

  it("resubscribes when the def set changes", () => {
    const onAction = vi.fn();
    const render = renderHook(({ digit }) => {
      const defs: HotkeyDef<"tab">[] = [{ id: "tab", chord: `alt+Digit${digit}`, repeat: "once" }];
      useHotkeys(defs, { onAction });
    }, { initialProps: { digit: 1 } });
    press({ code: "Digit1", altKey: true });
    expect(onAction).toHaveBeenCalledTimes(1);
    render.rerender({ digit: 2 });
    press({ code: "Digit1", altKey: true });
    press({ code: "Digit2", altKey: true });
    expect(onAction).toHaveBeenCalledTimes(2);
    render.unmount();
  });
});
