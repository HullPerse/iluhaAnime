import { describe, expect, it, vi } from "vitest";

import {
  createHotkeyRegistry,
  createHotkeysHandler,
  subscribeHotkeys,
} from "@/lib/hotkeys/registry.hotkeys";

function keydown(init: KeyboardEventInit & { code: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { cancelable: true, ...init });
}

describe("createHotkeyRegistry", () => {
  it("resolves exact chords and rejects wrong modifiers", () => {
    const registry = createHotkeyRegistry([
      { id: "save", chord: "ctrl+KeyS", repeat: "once" },
      { id: "help", chord: "Shift+Slash", repeat: "once" },
    ]);
    expect(registry.get("KeyS:true:false:false:false")?.id).toBe("save");
    expect(registry.get("Slash:false:true:false:false")?.id).toBe("help");
    expect(registry.get("KeyS:false:false:false:false")).toBeUndefined();
    expect(registry.get("KeyS:true:true:false:false")).toBeUndefined();
  });

  it("skips invalid chords and keeps the first of a clash", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const registry = createHotkeyRegistry([
        { id: "first", chord: "Space", repeat: "once" },
        { id: "second", chord: "Space", repeat: "hold" },
        { id: "broken", chord: "ctrl+", repeat: "once" },
      ]);
      expect(registry.size).toBe(1);
      expect(registry.get("Space:false:false:false:false")?.id).toBe("first");
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("createHotkeysHandler", () => {
  it("fires the action and prevents default on a hit", () => {
    const onAction = vi.fn();
    const handler = createHotkeysHandler({
      registry: createHotkeyRegistry([{ id: "go", chord: "KeyG", repeat: "hold" }]),
      onAction,
    });
    const event = keydown({ code: "KeyG" });
    handler(event);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("go", event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores misses, composing, filtered targets, and once-repeats", () => {
    const onAction = vi.fn();
    const handler = createHotkeysHandler({
      registry: createHotkeyRegistry([
        { id: "toggle", chord: "KeyM", repeat: "once" },
        { id: "seek", chord: "ArrowRight", repeat: "hold" },
      ]),
      ignore: (event) => event.target instanceof HTMLInputElement,
      onAction,
    });
    handler(keydown({ code: "KeyQ" }));
    const composing = keydown({ code: "KeyM" });
    Object.defineProperty(composing, "isComposing", { value: true });
    handler(composing);
    handler(keydown({ code: "KeyM", repeat: true }));
    const inputEvent = keydown({ code: "KeyM" });
    Object.defineProperty(inputEvent, "target", { value: document.createElement("input") });
    handler(inputEvent);
    expect(onAction).not.toHaveBeenCalled();
    handler(keydown({ code: "KeyM" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    handler(keydown({ code: "ArrowRight", repeat: true }));
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith("seek", expect.any(KeyboardEvent));
  });

  it("subscribes and unsubscribes a window listener", () => {
    const onAction = vi.fn();
    const stop = subscribeHotkeys(window, {
      defs: [{ id: "close", chord: "Escape", repeat: "once" }],
      onAction,
    });
    window.dispatchEvent(keydown({ code: "Escape", key: "Escape" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(keydown({ code: "Escape", key: "Escape" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
