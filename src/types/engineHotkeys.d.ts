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

export type VimEngineState = "idle" | "hints" | "prefix";

export interface VimEngineOptions {
  isEnabled: () => boolean;
  isExcludedRoute?: () => boolean;
  isOwner?: (target: EventTarget | null) => boolean;
  onCommand: (command: VimCommand, event: KeyboardEvent) => void;
  onActiveKey?: (event: KeyboardEvent, state: VimEngineState) => void;
  onCount?: (count: string) => void;
  getCount?: () => string;
  shouldYield?: (command: VimCommand, event: KeyboardEvent) => boolean;
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
