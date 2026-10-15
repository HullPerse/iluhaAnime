import { afterEach, describe, expect, it, vi } from "vitest";

import type { VimCommand, VimEngine, VimEngineState } from "@/lib/hotkeys/engine.hotkeys";
import { createVimCommandTable, createVimEngine } from "@/lib/hotkeys/engine.hotkeys";
import { isInsideLayer } from "@/lib/hotkeys/layer.hotkeys";

const open: VimEngine[] = [];
const nodes: HTMLElement[] = [];

function setup(options?: {
  enabled?: boolean;
  excludedRoute?: boolean;
  isOwner?: (target: EventTarget | null) => boolean;
  shouldYield?: (command: VimCommand, event: KeyboardEvent) => boolean;
  resolveChord?: (command: VimCommand) => string | null;
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
    shouldYield: options?.shouldYield,
    resolveChord: options?.resolveChord,
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
    expect(table.get("KeyG:false:true:false:false")).toBe("last");
    expect(table.get("KeyH:false:false:false:false")).toBe("edge.top");
    expect(table.get("KeyM:false:false:false:false")).toBe("edge.middle");
    expect(table.get("KeyL:false:false:false:false")).toBe("edge.bottom");
    expect(table.size).toBe(9);
  });

  it("leaves the bare prefix chord out of the single-stroke table", () => {
    const table = createVimCommandTable();
    expect(table.get("KeyG:false:false:false:false")).toBeUndefined();
  });
});

describe("vim engine sequences", () => {
  it("resolves gg to first across two keystrokes", () => {
    const { engine, onCommand } = setup();
    press(window, key("KeyG"));
    expect(onCommand).not.toHaveBeenCalled();
    expect(engine.state()).toBe("prefix");
    press(window, key("KeyG"));
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith("first", expect.any(KeyboardEvent));
    expect(engine.state()).toBe("idle");
  });

  it("clears the prefix on Escape without firing", () => {
    const { engine, onCommand } = setup();
    press(window, key("KeyG"));
    expect(engine.state()).toBe("prefix");
    press(window, key("Escape"));
    expect(onCommand).not.toHaveBeenCalled();
    expect(engine.state()).toBe("idle");
    press(window, key("KeyG"));
    expect(engine.state()).toBe("prefix");
  });

  it("falls through to the fresh keystroke on a prefix mismatch", () => {
    const { engine, onCommand } = setup();
    press(window, key("KeyG"));
    press(window, key("KeyJ"));
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith("scroll.down", expect.any(KeyboardEvent));
    expect(engine.state()).toBe("idle");
  });

  it("ignores the prefix inside excluded targets", () => {
    const { engine, onCommand } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    nodes.push(input);
    const event = key("KeyG");
    press(input, event);
    expect(onCommand).not.toHaveBeenCalled();
    expect(engine.state()).toBe("idle");
    expect(event.defaultPrevented).toBe(false);
  });
});

function setupWithCount(
  onCount: (count: string) => void,
  isOwner?: (target: EventTarget | null) => boolean,
  shouldYield?: (command: VimCommand, event: KeyboardEvent) => boolean
) {
  const onCommand = vi.fn();
  const onActiveKey = vi.fn<(event: KeyboardEvent, state: VimEngineState) => void>();
  const engine = createVimEngine({
    isEnabled: () => true,
    isExcludedRoute: () => false,
    isOwner,
    shouldYield,
    onCommand,
    onActiveKey,
    onCount,
  });
  engine.attach();
  open.push(engine);
  return { engine, onCommand, onActiveKey };
}

describe("vim engine count buffer", () => {
  it("buffers bare digits and reports them", () => {
    const onCount = vi.fn<(count: string) => void>();
    const { engine } = setupWithCount(onCount);
    press(window, key("Digit1"));
    press(window, key("Digit2"));
    expect(onCount).toHaveBeenCalledTimes(2);
    expect(onCount).toHaveBeenLastCalledWith("12");
    expect(engine.count()).toBe("12");
  });

  it("ignores a leading zero and caps the length", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    press(window, key("Digit0"));
    expect(onCount).not.toHaveBeenCalled();
    for (const code of ["Digit1", "Digit2", "Digit3", "Digit4"]) press(window, key(code));
    expect(onCount).toHaveBeenLastCalledWith("123");
  });

  it("ignores modified digits", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    press(window, key("Digit1", { shiftKey: true }));
    press(window, key("Digit1", { ctrlKey: true }));
    expect(onCount).not.toHaveBeenCalled();
  });

  it("ignores digits inside typing targets", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    const input = document.createElement("input");
    document.body.append(input);
    nodes.push(input);
    press(input, key("Digit1"));
    expect(onCount).not.toHaveBeenCalled();
  });

  it("clears when the engine consumes a non-count command", () => {
    const onCount = vi.fn<(count: string) => void>();
    const { engine, onCommand } = setupWithCount(onCount);
    press(window, key("Digit5"));
    press(window, key("KeyJ"));
    expect(onCommand).toHaveBeenCalledWith("scroll.down", expect.any(KeyboardEvent));
    expect(onCount).toHaveBeenLastCalledWith("");
    expect(engine.count()).toBe("");
  });

  it("keeps the count for an unmatched key (bubble consumers read it later)", () => {
    const onCount = vi.fn<(count: string) => void>();
    const { engine, onCommand } = setupWithCount(onCount);
    press(window, key("Digit3"));
    press(window, key("KeyQ"));
    expect(onCommand).not.toHaveBeenCalled();
    expect(engine.count()).toBe("3");
    expect(onCount).not.toHaveBeenCalledWith("");
  });

  it("keeps the count for a yielded chord (tree rows consume it)", () => {
    const onCount = vi.fn<(count: string) => void>();
    const { engine, onCommand } = setupWithCount(
      onCount,
      undefined,
      (command) => command === "scroll.down" || command === "scroll.up"
    );
    press(window, key("Digit3"));
    const yielded = key("KeyJ");
    press(window, yielded);
    expect(onCommand).not.toHaveBeenCalled();
    expect(yielded.defaultPrevented).toBe(false);
    expect(engine.count()).toBe("3");
  });

  it("keeps the count through the sequence prefix into first", () => {
    const onCount = vi.fn<(count: string) => void>();
    const { engine, onCommand } = setupWithCount(onCount);
    press(window, key("Digit3"));
    press(window, key("KeyG"));
    expect(engine.state()).toBe("prefix");
    expect(engine.count()).toBe("3");
    press(window, key("KeyG"));
    expect(onCommand).toHaveBeenCalledWith("first", expect.any(KeyboardEvent));
    expect(engine.count()).toBe("3");
  });

  it("clears on Escape", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    press(window, key("Digit5"));
    press(window, key("Escape"));
    expect(onCount).toHaveBeenLastCalledWith("");
  });

  it("resyncs onto an externally cleared count (no 22 after 2-motion)", () => {
    let store = "";
    const onCount = vi.fn<(count: string) => void>((next) => {
      store = next;
    });
    const onCommand = vi.fn();
    const engine = createVimEngine({
      isEnabled: () => true,
      isExcludedRoute: () => false,
      onCommand,
      onActiveKey: vi.fn(),
      onCount,
      getCount: () => store,
    });
    engine.attach();
    open.push(engine);
    press(window, key("Digit2"));
    expect(store).toBe("2");
    store = "";
    press(window, key("Digit2"));
    expect(onCount).toHaveBeenLastCalledWith("2");
    expect(engine.count()).toBe("2");
  });

  it("buffers numpad digits when they report a digit key", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    press(window, key("Numpad3", { key: "3" }));
    expect(onCount).toHaveBeenLastCalledWith("3");
  });

  it("ignores numpad keys reporting arrows (NumLock off)", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    press(window, key("Numpad3", { key: "ArrowDown" }));
    press(window, key("Numpad2", { key: "ArrowDown", shiftKey: true }));
    expect(onCount).not.toHaveBeenCalled();
  });

  it("survives a prefix mismatch into the buffer", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount);
    press(window, key("KeyG"));
    press(window, key("Digit3"));
    expect(onCount).toHaveBeenLastCalledWith("3");
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

describe("vim engine surface yield", () => {
  it("leaves a yielded chord unconsumed for the surface handler", () => {
    const { onCommand } = setup({
      shouldYield: (command) => command === "scroll.down" || command === "scroll.up",
    });
    const yielded = key("KeyJ");
    press(window, yielded);
    expect(onCommand).not.toHaveBeenCalled();
    expect(yielded.defaultPrevented).toBe(false);
    press(window, key("KeyD"));
    expect(onCommand).toHaveBeenCalledWith("scroll.half.down", expect.any(KeyboardEvent));
  });

  it("resolves single-stroke chords through the provider", () => {
    const { onCommand } = setup({
      resolveChord: (command) => (command === "scroll.down" ? "KeyX" : null),
    });
    press(window, key("KeyX"));
    expect(onCommand).toHaveBeenCalledWith("scroll.down", expect.any(KeyboardEvent));
    press(window, key("KeyJ"));
    press(window, key("KeyF"));
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it("buffers digits on an owned button (tree-folder rows are buttons)", () => {
    const onCount = vi.fn<(count: string) => void>();
    setupWithCount(onCount, (target) => target instanceof HTMLElement);
    const button = document.createElement("button");
    document.body.append(button);
    nodes.push(button);
    const event = key("Digit3");
    press(button, event);
    expect(onCount).toHaveBeenCalledWith("3");
    expect(event.defaultPrevented).toBe(true);
  });
});

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
