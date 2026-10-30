import { describe, expect, it, vi } from "vitest";

import { GAME_KEY_BY_CODE, GAME_KEYPAD_ROWS } from "@/config/settings/keypad.config";
import { subscribeKeypad } from "@/lib/core/keypadHotkeys.utils";

function press(
  type: "keydown" | "keyup",
  code: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window
): KeyboardEvent {
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, code, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("subscribeKeypad", () => {
  it("maps the full keypad layout onto chip-8 keys", () => {
    const onKey = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });

    for (const row of GAME_KEYPAD_ROWS) {
      for (const entry of row) {
        press("keydown", entry.code);
        press("keyup", entry.code);
      }
    }

    const expected = GAME_KEYPAD_ROWS.flatMap((row) =>
      row.flatMap((entry) => [
        [entry.key, true],
        [entry.key, false],
      ])
    );
    expect(onKey.mock.calls).toEqual(expected);
    release();
  });

  it("ignores repeats, modified presses and unmapped keys", () => {
    const onKey = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });

    press("keydown", "KeyX", { repeat: true });
    press("keydown", "KeyX", { ctrlKey: true });
    press("keydown", "KeyX", { altKey: true });
    press("keydown", "KeyX", { metaKey: true });
    press("keydown", "KeyP");
    expect(onKey).not.toHaveBeenCalled();

    // A release without a tracked press is not forwarded either.
    press("keyup", "KeyX");
    expect(onKey).not.toHaveBeenCalled();
    release();
  });

  it("does not steal keys typed into text entries", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const onKey = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });

    press("keydown", "KeyA", {}, input);
    press("keyup", "KeyA", {}, input);
    expect(onKey).not.toHaveBeenCalled();

    release();
    input.remove();
  });

  it("claims the key before other listeners and prevents the default", () => {
    const onKey = vi.fn();
    const bubble = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });
    window.addEventListener("keydown", bubble);
    const div = document.createElement("div");
    document.body.append(div);

    const event = press("keydown", "Digit2", {}, div);

    expect(event.defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();

    window.removeEventListener("keydown", bubble);
    div.remove();
    release();
  });

  it("releases every held key when the window loses focus", () => {
    const onKey = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });

    press("keydown", "KeyQ");
    press("keydown", "KeyW");
    window.dispatchEvent(new Event("blur"));

    expect(onKey.mock.calls.slice(-2)).toEqual([
      [0x4, false],
      [0x5, false],
    ]);
    release();
  });

  it("releases held keys when the document is hidden", () => {
    const onKey = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });

    press("keydown", "KeyC");
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onKey).toHaveBeenLastCalledWith(0xb, false);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    release();
  });

  it("detaches listeners and releases held keys on unsubscribe", () => {
    const onKey = vi.fn();
    const release = subscribeKeypad(window, { keys: GAME_KEY_BY_CODE, onKey });

    press("keydown", "KeyV");
    release();
    expect(onKey).toHaveBeenLastCalledWith(0xf, false);

    onKey.mockClear();
    press("keydown", "KeyV");
    window.dispatchEvent(new Event("blur"));
    expect(onKey).not.toHaveBeenCalled();
  });
});
