import { afterEach, describe, expect, it } from "vitest";

import { ignoreTabCycle, stepTabId } from "@/lib/hotkeys/tabs.hotkeys";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("stepTabId", () => {
  it("steps forward and wraps around", () => {
    expect(stepTabId(["a", "b", "c"], "b", 1)).toBe("c");
    expect(stepTabId(["a", "b", "c"], "c", 1)).toBe("a");
  });

  it("steps backward and wraps around", () => {
    expect(stepTabId(["a", "b", "c"], "a", -1)).toBe("c");
    expect(stepTabId(["a", "b", "c"], "b", -1)).toBe("a");
  });

  it("starts at the ends without a known active id", () => {
    expect(stepTabId(["a", "b"], "zzz", 1)).toBe("a");
    expect(stepTabId(["a", "b"], "zzz", -1)).toBe("b");
  });

  it("reports failure without ids", () => {
    expect(stepTabId([], "a", 1)).toBeNull();
  });
});

describe("ignoreTabCycle", () => {
  function press(target: EventTarget): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { code: "BracketLeft", shiftKey: true });
    target.dispatchEvent(event);
    return event;
  }

  it("ignores text entry targets", () => {
    const input = document.createElement("input");
    document.body.append(input);
    expect(ignoreTabCycle(press(input))).toBe(true);
    const area = document.createElement("textarea");
    document.body.append(area);
    expect(ignoreTabCycle(press(area))).toBe(true);
  });

  it("accepts focused buttons and checkboxes", () => {
    const button = document.createElement("button");
    document.body.append(button);
    expect(ignoreTabCycle(press(button))).toBe(false);
    const check = document.createElement("input");
    check.setAttribute("type", "checkbox");
    document.body.append(check);
    expect(ignoreTabCycle(press(check))).toBe(false);
  });

  it("ignores open layers", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.getBoundingClientRect = () => ({ width: 100, height: 100 }) as DOMRect;
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    expect(ignoreTabCycle(press(button))).toBe(true);
  });

  it("accepts plain surfaces", () => {
    const row = document.createElement("div");
    row.tabIndex = -1;
    document.body.append(row);
    expect(ignoreTabCycle(press(row))).toBe(false);
  });
});
