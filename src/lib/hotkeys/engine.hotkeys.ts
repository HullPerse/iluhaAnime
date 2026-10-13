import {
  VIM_DISABLED_ATTRIBUTE,
  VIM_MOTION_KEYS,
  VIM_SCROLL_KEYS,
  VIM_TRIGGER_CHORD,
} from "@/config/keyboard/vim.config";

import { chordKey, chordKeyFromEvent, parseChord } from "./chord.hotkeys";
import { shouldIgnoreHotkeys } from "./filter.hotkeys";

export type VimCommand =
  | "hints"
  | "scroll.down"
  | "scroll.up"
  | "scroll.half.down"
  | "scroll.half.up"
  | "first"
  | "last"
  | "edge.top"
  | "edge.middle"
  | "edge.bottom";

/** idle -> the surface owns the keyboard; hints -> badges are open; prefix -> a sequence prefix waits. */
export type VimEngineState = "idle" | "hints" | "prefix";

export interface VimEngineOptions {
  isEnabled: () => boolean;
  isExcludedRoute?: () => boolean;
  /**
   * The open layer (dialog/menu) that owns the keyboard, if any. Keys pressed
   * inside it are routed to the engine even though such layers mark themselves
   * as hotkey-disabled - that flag is what stops *global* shortcuts, and the
   * layer is exactly where hints should work. `data-vim-disabled` still wins.
   */
  isOwner?: (target: EventTarget | null) => boolean;
  onCommand: (command: VimCommand, event: KeyboardEvent) => void;
  /** Keys pressed while hints are open (label typing, Alt+label, Esc). */
  onActiveKey?: (event: KeyboardEvent, state: VimEngineState) => void;
  /** Fires whenever the digit buffer changes (empty string clears it). */
  onCount?: (count: string) => void;
}

export interface VimEngine {
  attach: () => void;
  detach: () => void;
  isAttached: () => boolean;
  state: () => VimEngineState;
  setState: (next: VimEngineState) => void;
  count: () => string;
}

const COUNT_DIGITS = 3;

function isBareDigit(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  const match = /^Digit([0-9])$/.exec(event.code);
  return match ? (match[1] ?? null) : null;
}

function isVimExcludedTarget(
  target: EventTarget | null,
  isOwner?: (target: EventTarget | null) => boolean
): boolean {
  const element = target instanceof HTMLElement ? target : null;
  // The route opt-out is absolute: it is the app saying "no vim here".
  if (element?.closest(`[${VIM_DISABLED_ATTRIBUTE}]`)) return true;
  if (isOwner?.(target)) return false;
  return shouldIgnoreHotkeys(target);
}

export function createVimCommandTable(): Map<string, VimCommand> {
  const table = new Map<string, VimCommand>();
  const add = (chord: string, command: VimCommand): void => {
    const parsed = parseChord(chord);
    if (parsed) table.set(chordKey(parsed), command);
  };
  add(VIM_TRIGGER_CHORD, "hints");
  add(VIM_SCROLL_KEYS.lineDown, "scroll.down");
  add(VIM_SCROLL_KEYS.lineUp, "scroll.up");
  add(VIM_SCROLL_KEYS.halfDown, "scroll.half.down");
  add(VIM_SCROLL_KEYS.halfUp, "scroll.half.up");
  add(VIM_MOTION_KEYS.last, "last");
  add(VIM_MOTION_KEYS.edgeTop, "edge.top");
  add(VIM_MOTION_KEYS.edgeMiddle, "edge.middle");
  add(VIM_MOTION_KEYS.edgeBottom, "edge.bottom");
  return table;
}

function sequenceTable(): Map<string, Map<string, VimCommand>> {
  const table = new Map<string, Map<string, VimCommand>>();
  const chordOf = (chord: string): string | null => {
    const parsed = parseChord(chord);
    return parsed ? chordKey(parsed) : null;
  };
  const prefix = chordOf(VIM_MOTION_KEYS.firstPrefix);
  const again = chordOf(VIM_MOTION_KEYS.first);
  if (prefix && again) table.set(prefix, new Map([[again, "first"]]));
  return table;
}

export function createVimEngine(options: VimEngineOptions): VimEngine {
  const table = createVimCommandTable();
  const sequences = sequenceTable();
  let state: VimEngineState = "idle";
  let pending: Map<string, VimCommand> | null = null;
  let pendingCount = "";
  let handler: ((event: KeyboardEvent) => void) | null = null;

  const clearCount = (): void => {
    if (pendingCount === "") return;
    pendingCount = "";
    options.onCount?.("");
  };

  const handleIdleKey = (event: KeyboardEvent): void => {
    const digit = isBareDigit(event);
    if (digit !== null) {
      if (isVimExcludedTarget(event.target, options.isOwner)) return;
      if (!(pendingCount === "" && digit === "0") && pendingCount.length < COUNT_DIGITS) {
        pendingCount += digit;
        options.onCount?.(pendingCount);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (pendingCount !== "") clearCount();
    const chord = chordKeyFromEvent(event);
    const sequence = sequences.get(chord);
    if (sequence) {
      if (isVimExcludedTarget(event.target, options.isOwner)) return;
      pending = sequence;
      state = "prefix";
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const command = table.get(chord);
    if (!command) return;
    // Only owned chords evaluate the gate, so an unowned keystroke never pays
    // for the layer lookup.
    if (isVimExcludedTarget(event.target, options.isOwner)) return;
    event.preventDefault();
    event.stopPropagation();
    options.onCommand(command, event);
  };

  const handlePrefixKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      state = "idle";
      pending = null;
      clearCount();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isVimExcludedTarget(event.target, options.isOwner)) {
      state = "idle";
      pending = null;
      return;
    }
    const command = pending?.get(chordKeyFromEvent(event));
    state = "idle";
    pending = null;
    if (!command) {
      handleIdleKey(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    options.onCommand(command, event);
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.defaultPrevented) return;
    if (!options.isEnabled()) return;
    if (options.isExcludedRoute?.()) return;

    if (state === "prefix") {
      handlePrefixKey(event);
      return;
    }

    if (state !== "idle") {
      if (isVimExcludedTarget(event.target, options.isOwner)) return;
      options.onActiveKey?.(event, state);
      return;
    }

    handleIdleKey(event);
  };

  return {
    attach: () => {
      if (handler || typeof window === "undefined") return;
      handler = handleKeyDown;
      window.addEventListener("keydown", handler, true);
    },
    detach: () => {
      if (!handler) return;
      window.removeEventListener("keydown", handler, true);
      handler = null;
    },
    isAttached: () => handler !== null,
    state: () => state,
    count: () => pendingCount,
    setState: (next) => {
      state = next;
      if (next !== "prefix") pending = null;
      if (next !== "idle") clearCount();
    },
  };
}
