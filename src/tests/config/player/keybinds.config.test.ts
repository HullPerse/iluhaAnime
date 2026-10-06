import { describe, expect, it } from "vitest";

import { getAction, KEYBINDS, shouldIgnoreHotkeys } from "@/config/player/keybinds.config";

const POSITIVE_CASES: Array<[code: string, action: string, ctrl?: boolean, shift?: boolean]> = [
  ["Space", "playPause"],
  ["ArrowLeft", "seekBackward"],
  ["ArrowRight", "seekForward"],
  ["ArrowUp", "volumeUp"],
  ["ArrowDown", "volumeDown"],
  ["KeyM", "toggleMute"],
  ["Comma", "frameBackward"],
  ["Period", "frameForward"],
  ["F1", "subtitleOffsetDown"],
  ["F2", "subtitleOffsetUp"],
  ["F1", "subtitleOffsetDownFine", true],
  ["F2", "subtitleOffsetUpFine", true],
  ["F3", "audioOffsetDown"],
  ["F4", "audioOffsetUp"],
  ["F3", "audioOffsetDownFine", true],
  ["F4", "audioOffsetUpFine", true],
  ["F5", "resetDelays"],
  ["KeyH", "toggleAutoHide", true],
  ["KeyI", "toggleDiagnostics"],
  ["PageDown", "nextFile"],
  ["PageUp", "prevFile"],
  ["KeyF", "toggleFullscreen"],
  ["Slash", "toggleCheatsheet", false, true],
  ["Escape", "exitCinemaMode"],
  ["KeyG", "jumpToTime", true],
];

describe("getAction", () => {
  it("resolves every entry of the keybind table", () => {
    expect(KEYBINDS.length).toBeGreaterThan(0);
    for (const keybind of KEYBINDS) {
      const match = getAction(
        keybind.code,
        keybind.ctrl ?? false,
        keybind.shift ?? false,
        keybind.alt ?? false
      );
      expect(match?.action).toBe(keybind.action);
    }
  });

  it("maps each positive chord to its action", () => {
    for (const [code, action, ctrl = false, shift = false] of POSITIVE_CASES) {
      expect(getAction(code, ctrl, shift, false)?.action, code).toBe(action);
    }
  });

  it("rejects the same code with wrong modifiers", () => {
    expect(getAction("Space", true, false, false)).toBeUndefined();
    expect(getAction("KeyF", false, true, false)).toBeUndefined();
    expect(getAction("Slash", false, false, false)).toBeUndefined();
    expect(getAction("Slash", true, false, false)).toBeUndefined();
    expect(getAction("F1", false, true, false)).toBeUndefined();
    expect(getAction("Escape", true, false, false)).toBeUndefined();
    expect(getAction("KeyP", true, true, false)).toBeUndefined();
  });
});

function makeElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

describe("shouldIgnoreHotkeys", () => {
  const IGNORED: Array<[tag: string, attrs?: Record<string, string>]> = [
    ["input"],
    ["textarea"],
    ["select"],
    ["button"],
    ["div", { contenteditable: "true" }],
    ["div", { "data-no-hotkeys": "" }],
    ["div", { "data-hotkeys-disabled": "" }],
    ["div", { "data-no-wheel": "" }],
  ];

  it("ignores every selector member of the hotkey ignore list", () => {
    for (const [tag, attrs] of IGNORED) {
      expect(shouldIgnoreHotkeys(makeElement(tag, attrs)), tag).toBe(true);
    }
  });

  it("walks up the ancestor tree via closest", () => {
    const wrapper = makeElement("div", { "data-no-hotkeys": "" });
    const inner = makeElement("span");
    wrapper.append(inner);
    expect(shouldIgnoreHotkeys(inner)).toBe(true);
  });

  it("accepts events on plain elements", () => {
    expect(shouldIgnoreHotkeys(makeElement("div"))).toBe(false);
    expect(shouldIgnoreHotkeys(makeElement("div", { contenteditable: "false" }))).toBe(false);
  });

  it("returns false for non-element targets", () => {
    expect(shouldIgnoreHotkeys(null)).toBe(false);
    expect(shouldIgnoreHotkeys(document)).toBe(false);
    expect(shouldIgnoreHotkeys(document.createTextNode("x"))).toBe(false);
  });
});
