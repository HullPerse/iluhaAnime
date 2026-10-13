import { afterEach, describe, expect, it, vi } from "vitest";

import type { VimEngine, VimEngineState } from "@/lib/hotkeys/engine.hotkeys";
import { createVimCommandTable, createVimEngine } from "@/lib/hotkeys/engine.hotkeys";
import { isInsideLayer } from "@/lib/hotkeys/layer.hotkeys";

const open: VimEngine[] = [];
const nodes: HTMLElement[] = [];

function setup(options?: {
  enabled?: boolean;
  excludedRoute?: boolean;
  isOwner?: (target: EventTarget | null) => boolean;
}): {
  engine: VimEngine;
  onCommand: ReturnType<typeof vi.fn>;
  onActiveKey: ReturnType<typeof vi.fn>;
} {
  const onCommand = vi.fn();
  const onActiveKey = vi.fn<(event: KeyboardEvent, state: VimEngineState) => void>();
  const engine = createVimEngine({
    isEnabled: () => options?.enabled ?? true,
    isExcludedRoute: () => options?.excludedRoute ?? false,
    isOwner: options?.isOwner,
    onCommand,
    onActiveKey,
  });
  engine.attach();
  open.push(engine);
  return { engine, onCommand, onActiveKey };
}

function key(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { code, cancelable: true, bubbles: true, ...init });
}

function press(target: EventTarget, event: KeyboardEvent): void {
  target.dispatchEvent(event);
}

afterEach(() => {
  for (const engine of open.splice(0)) engine.detach();
  for (const node of nodes.splice(0)) node.remove();
});

describe("createVimCommandTable", () => {
  it("binds the trigger and scroll chords to their command ids", () => {
    const table = createVimCommandTable();
    expect(table.get("KeyF:false:false:false:false")).toBe("hints");
    expect(table.get("KeyJ:false:false:false:false")).toBe("scroll.down");
    expect(table.get("KeyK:false:false:false:false")).toBe("scroll.up");
    expect(table.get("KeyD:false:false:false:false")).toBe("scroll.half.down");
    expect(table.get("KeyU:false:false:false:false")).toBe("scroll.half.up");
    expect(table.size).toBe(5);
  });
});

describe("vim engine gates", () => {
  it("is inert while the setting is off", () => {
    const { onCommand } = setup({ enabled: false });
    const event = key("KeyF");
    press(window, event);
    expect(onCommand).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("is inert on the player surface", () => {
    const { onCommand } = setup({ excludedRoute: true });
    press(window, key("KeyF"));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("ignores events inside a data-vim-disabled subtree", () => {
    const { onCommand } = setup();
    const root = document.createElement("div");
    root.dataset.vimDisabled = "";
    const inner = document.createElement("span");
    root.append(inner);
    document.body.append(root);
    nodes.push(root);
    const event = key("KeyF");
    press(inner, event);
    expect(onCommand).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores typing targets", () => {
    const { onCommand } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    nodes.push(input);
    press(input, key("KeyF"));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys and composition", () => {
    const { onCommand } = setup();
    press(window, key("KeyQ"));
    const composing = key("KeyF");
    Object.defineProperty(composing, "isComposing", { value: true });
    press(window, composing);
    expect(onCommand).not.toHaveBeenCalled();
  });
});

// Section 13.1 of `vim-mode.md`: a modal marks itself hotkey-disabled (that is
// what keeps global shortcuts out of it), but it is exactly where hints should
// work - scoped to the layer instead of the page behind it.
describe("vim engine layer ownership", () => {
  function modalLayer(): { layer: HTMLElement; inside: HTMLElement } {
    const layer = document.createElement("div");
    layer.dataset.hotkeysDisabled = "true";
    const inside = document.createElement("button");
    layer.append(inside);
    document.body.append(layer);
    nodes.push(layer);
    return { layer, inside };
  }

  it("serves chords inside the layer that owns the keyboard", () => {
    const { layer, inside } = modalLayer();
    const { onCommand } = setup({ isOwner: (target) => isInsideLayer(target, layer) });

    const event = key("KeyF");
    press(inside, event);

    expect(onCommand).toHaveBeenCalledWith("hints", event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("stays inert in that same layer without an owner", () => {
    const { inside } = modalLayer();
    const { onCommand } = setup();

    const event = key("KeyF");
    press(inside, event);

    expect(onCommand).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps data-vim-disabled absolute, even for an owned target", () => {
    const { layer, inside } = modalLayer();
    layer.dataset.vimDisabled = "";
    const { onCommand } = setup({ isOwner: (target) => isInsideLayer(target, layer) });

    press(inside, key("KeyF"));

    expect(onCommand).not.toHaveBeenCalled();
  });

  it("does not claim unowned chords inside the layer", () => {
    const { layer, inside } = modalLayer();
    const { onCommand } = setup({ isOwner: (target) => isInsideLayer(target, layer) });

    press(inside, key("KeyQ"));

    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("vim engine routing", () => {
  it("dispatches hints on the bare F trigger and consumes the event", () => {
    const { onCommand } = setup();
    const event = key("KeyF");
    press(window, event);
    expect(onCommand).toHaveBeenCalledWith("hints", event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("requires the exact chord (no modifier leakage)", () => {
    const { onCommand } = setup();
    press(window, key("KeyF", { ctrlKey: true }));
    press(window, key("KeyF", { altKey: true }));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("maps the scroll keys", () => {
    const { onCommand } = setup();
    press(window, key("KeyJ"));
    press(window, key("KeyK"));
    press(window, key("KeyD"));
    press(window, key("KeyU"));
    expect(onCommand.mock.calls.map((call) => call[0])).toEqual([
      "scroll.down",
      "scroll.up",
      "scroll.half.down",
      "scroll.half.up",
    ]);
  });

  it("routes keys to the active handler while hints are open", () => {
    const { engine, onCommand, onActiveKey } = setup();
    engine.setState("hints");
    press(window, key("KeyF"));
    press(window, key("KeyA"));
    expect(onCommand).not.toHaveBeenCalled();
    expect(onActiveKey).toHaveBeenCalledTimes(2);
    expect(onActiveKey).toHaveBeenCalledWith(expect.any(KeyboardEvent), "hints");
  });
});

describe("vim engine lifecycle", () => {
  it("subscribes and removes the capture listener", () => {
    const { engine, onCommand } = setup();
    expect(engine.isAttached()).toBe(true);
    press(window, key("KeyF"));
    expect(onCommand).toHaveBeenCalledTimes(1);

    engine.detach();
    expect(engine.isAttached()).toBe(false);
    press(window, key("KeyF"));
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it("starts idle", () => {
    const { engine } = setup();
    expect(engine.state()).toBe("idle");
  });
});
