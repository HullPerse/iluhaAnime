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
  /**
   * Single source of truth for the pending count. Consumers (tree rows,
   * resize chords) read and clear the count through their own channel, so
   * the engine accumulates digits onto this value instead of a private
   * buffer that would go stale behind an external clear. Without it the
   * engine falls back to its local buffer (tests, harnesses).
   */
  getCount?: () => string;
  /**
   * Lets a surface keep its own chord: when true, the engine neither consumes
   * nor fires, so a bubble-phase handler behind it still runs. Tree rows own
   * `j`/`k` this way - the engine sees them first (window capture) and must
   * step aside before `preventDefault`/`stopPropagation`.
   */
  shouldYield?: (command: VimCommand, event: KeyboardEvent) => boolean;
  /**
   * Resolves a command's live chord through the keybind overrides (null
   * unbinds it). Called per keystroke while set; without it the static
   * table below applies. Sequence strokes (`gg`) stay fixed and never pass
   * through here.
   */
  resolveChord?: (command: VimCommand) => string | null;
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
  if (match) return match[1] ?? null;
  // Numpad digits count only when they really are digits: with NumLock off
  // the same keys report arrows/home/end, which must never buffer.
  const pad = /^Numpad([0-9])$/.exec(event.code);
  if (pad && event.key === pad[1]) return pad[1] ?? null;
  return null;
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

  // The single-stroke table with overrides applied. Rebuilt per keystroke so
  // a rebind takes effect without re-attaching: a dozen parses per keydown is
  // noise next to the layer lookup the gate already pays.
  const liveTable = (): Map<string, VimCommand> => {
    if (!options.resolveChord) return table;
    const merged = new Map<string, VimCommand>();
    const seen = new Set<VimCommand>();
    for (const [, command] of table) {
      if (seen.has(command)) continue;
      seen.add(command);
      const chord = options.resolveChord(command);
      if (chord === null) continue;
      const parsed = parseChord(chord);
      if (parsed) merged.set(chordKey(parsed), command);
    }
    return merged;
  };

  const handleIdleKey = (event: KeyboardEvent): void => {
    const digit = isBareDigit(event);
    if (digit !== null) {
      if (isVimExcludedTarget(event.target, options.isOwner)) return;
      const base = options.getCount?.() ?? pendingCount;
      if (!(base === "" && digit === "0") && base.length < COUNT_DIGITS) {
        pendingCount = base + digit;
        options.onCount?.(pendingCount);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // No eager count reset here: the count belongs to the next command,
    // which may live behind this listener (tree rows consume it in bubble
    // phase) or behind a sequence. Only the engine's own non-count commands
    // and Escape drop it. Escape clears without consuming, like before.
    if (event.code === "Escape") {
      clearCount();
      return;
    }
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
    const command = liveTable().get(chord);
    if (!command) return;
    // A yielded chord is never consumed: no gate lookup, no preventDefault,
    // no command. The surface handler behind this capture listener owns it.
    if (options.shouldYield?.(command, event)) return;
    // Only owned chords evaluate the gate, so an unowned keystroke never pays
    // for the layer lookup.
    if (isVimExcludedTarget(event.target, options.isOwner)) return;
    // First/last read the count themselves (focusTreeIndex); every other
    // engine command drops a pending count so it cannot leak into a later
    // motion.
    if (command !== "last" && command !== "first") clearCount();
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
