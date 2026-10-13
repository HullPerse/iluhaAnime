/**
 * Keyboard codes (event.code, layout independent) for the vim commands. The
 * RU layout is why the engine matches `code` and never `key`.
 */
export const VIM_TRIGGER_CHORD = "KeyF";

export const VIM_SCROLL_KEYS = {
  lineDown: "KeyJ",
  lineUp: "KeyK",
  halfDown: "KeyD",
  halfUp: "KeyU",
} as const;

export const VIM_MOTION_KEYS = {
  firstPrefix: "KeyG",
  first: "KeyG",
  last: "Shift+KeyG",
  edgeTop: "KeyH",
  edgeMiddle: "KeyM",
  edgeBottom: "KeyL",
} as const;

// Home-row first, Vimium-C style. Every character is unique on purpose:
// a repeated letter would hand the same label to two badges. The plan's
// draft ``fjdkslaghrueiwovnmcd`` repeated `d`; this is the deduped set.
export const VIM_LABEL_ALPHABET = "fjdkslaghrueiwovnmc";

export const VIM_MAX_LABEL_LENGTH = 2;

/** Roughly one list row; `j`/`k` step this much. */
export const VIM_SCROLL_LINE_PX = 60;

/** Only one status text: "N more targets". Paging is out of v1 scope. */
export const VIM_DISABLED_ATTRIBUTE = "data-vim-disabled";

/**
 * The scrolled surface of a route (collection, anilist, search, torrent,
 * settings all carry it). Hint labels are handed out to this region first -
 * see `scanHintTargets` - and it doubles as the scroll fallback in
 * `vimMode.hook.ts`.
 */
export const VIM_CONTENT_SELECTOR = "[data-scroll-root]";

export const VIM_HINT_ATTRIBUTES = {
  target: "data-vim-target",
  contextMenu: "data-vim-contextmenu",
  ctrlClick: "data-vim-ctrlclick",
  label: "data-vim-label",
} as const;
