import {
  VIM_DISABLED_ATTRIBUTE,
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
  | "scroll.half.up";

/** idle -> the surface owns the keyboard; hints -> badges are open. */
export type VimEngineState = "idle" | "hints";

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
}

export interface VimEngine {
  attach: () => void;
  detach: () => void;
  isAttached: () => boolean;
  state: () => VimEngineState;
  setState: (next: VimEngineState) => void;
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
  return table;
}

export function createVimEngine(options: VimEngineOptions): VimEngine {
  const table = createVimCommandTable();
  let state: VimEngineState = "idle";
  let handler: ((event: KeyboardEvent) => void) | null = null;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.defaultPrevented) return;
    if (!options.isEnabled()) return;
    if (options.isExcludedRoute?.()) return;

    if (state !== "idle") {
      if (isVimExcludedTarget(event.target, options.isOwner)) return;
      options.onActiveKey?.(event, state);
      return;
    }

    const command = table.get(chordKeyFromEvent(event));
    if (!command) return;
    // Only owned chords evaluate the gate, so an unowned keystroke never pays
    // for the layer lookup.
    if (isVimExcludedTarget(event.target, options.isOwner)) return;
    event.preventDefault();
    event.stopPropagation();
    options.onCommand(command, event);
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
    setState: (next) => {
      state = next;
    },
  };
}
