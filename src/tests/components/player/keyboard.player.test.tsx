import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DIGIT_KEYS, VIEW_MODE_DIGITS } from "@/config/player/keybinds.config";
import Keyboard from "@/routes/components/player/media/keyboard.player";

function fireWheel(target: Element, deltaY: number): void {
  target.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true }));
}

function pressKey(
  code: string,
  options: { ctrlKey?: boolean; shiftKey?: boolean; repeat?: boolean } = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    ctrlKey: options.ctrlKey ?? false,
    repeat: options.repeat ?? false,
    shiftKey: options.shiftKey ?? false,
  });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup();
});

describe("Keyboard shortcuts", () => {
  it("maps every chord from the player gap audit to its action", () => {
    const onAction = vi.fn();
    render(<Keyboard onAction={onAction} />);

    const cases: [string, string, boolean][] = [
      ["KeyL", "togglePlaylist", false],
      ["KeyN", "skipChapter", false],
      ["Comma", "speedDown", true],
      ["Period", "speedUp", true],
      ["KeyR", "speedReset", false],
      ["KeyV", "cycleSubtitle", false],
      ["KeyB", "cycleAudio", false],
      ["Home", "seekToStart", false],
      ["End", "seekToEnd", false],
      ["KeyJ", "playlistDown", false],
      ["KeyK", "playlistUp", false],
      ["Enter", "playlistActivate", false],
    ];
    for (const [code, action, shiftKey] of cases) {
      onAction.mockClear();
      pressKey(code, { shiftKey });
      expect(onAction.mock.calls.at(-1)?.[0], code).toBe(action);
    }
  });

  it("maps the view presets to bare 1, 2, 3 and always on top to ctrl+a", () => {
    const onAction = vi.fn();
    render(<Keyboard onAction={onAction} />);

    const cases: [string, string][] = [
      ["Digit1", "viewMinimal"],
      ["Digit2", "viewCompact"],
      ["Digit3", "viewNormal"],
    ];
    for (const [code, action] of cases) {
      onAction.mockClear();
      pressKey(code);
      expect(onAction.mock.calls.at(-1)?.[0], code).toBe(action);
    }

    onAction.mockClear();
    pressKey("KeyA", { ctrlKey: true });
    expect(onAction.mock.calls.at(-1)?.[0]).toBe("toggleAlwaysOnTop");
  });

  it("maps each bare digit to its tenth of the file and the freed ones to shift", () => {
    const onAction = vi.fn();
    render(<Keyboard onAction={onAction} />);

    for (const digit of DIGIT_KEYS) {
      onAction.mockClear();
      const shifted = VIEW_MODE_DIGITS.includes(digit);
      pressKey(`Digit${digit}`, { shiftKey: shifted });
      expect(onAction.mock.calls.at(-1)?.[0], `Digit${digit}`).toBe(`seekPercent${digit}`);
    }
  });

  it("leaves the plain frame keys and unbound shifted digits alone", () => {
    const onAction = vi.fn();
    render(<Keyboard onAction={onAction} />);

    pressKey("Comma");
    expect(onAction.mock.calls.at(-1)?.[0]).toBe("frameBackward");

    onAction.mockClear();
    pressKey("Digit5", { shiftKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat for the one-shot seek digits and presets", () => {
    const onAction = vi.fn();
    render(<Keyboard onAction={onAction} />);

    pressKey("Digit5");
    pressKey("Digit5", { repeat: true });
    expect(onAction).toHaveBeenCalledTimes(1);

    onAction.mockClear();
    pressKey("Digit1");
    pressKey("Digit1", { repeat: true });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("still ignores keys typed into an input", () => {
    const onAction = vi.fn();
    render(
      <>
        <Keyboard onAction={onAction} />
        <input data-testid="field" />
      </>
    );
    const field = document.querySelector("input");
    if (!field) throw new Error("input missing");

    field.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "Digit5" }));
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("Keyboard wheel", () => {
  it("ignores wheel events inside the playlist scroll container", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const scroller = document.createElement("div");
    scroller.dataset.playlistScroll = "";
    const inner = document.createElement("span");
    inner.textContent = "row";
    scroller.append(inner);
    document.body.append(scroller);
    try {
      fireWheel(inner, 100);
      expect(onWheel).not.toHaveBeenCalled();
    } finally {
      scroller.remove();
    }
  });

  it("ignores wheel events inside data-no-wheel containers", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const panel = document.createElement("div");
    panel.dataset.noWheel = "";
    const inner = document.createElement("span");
    panel.append(inner);
    document.body.append(panel);
    try {
      fireWheel(inner, 100);
      expect(onWheel).not.toHaveBeenCalled();
    } finally {
      panel.remove();
    }
  });

  it("ignores wheel events inside any vertically scrollable element", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 100, configurable: true });
    const inner = document.createElement("span");
    scroller.append(inner);
    document.body.append(scroller);
    try {
      fireWheel(inner, 100);
      expect(onWheel).not.toHaveBeenCalled();
    } finally {
      scroller.remove();
    }
  });

  it("changes volume on wheel over plain elements", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const plain = document.createElement("div");
    document.body.append(plain);
    try {
      fireWheel(plain, 100);
      expect(onWheel).toHaveBeenCalledWith(-1);
      fireWheel(plain, -100);
      expect(onWheel).toHaveBeenCalledWith(1);
    } finally {
      plain.remove();
    }
  });
});
