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

export const VIM_LABEL_ALPHABET = "fjdkslaghrueiwovnmc";

export const VIM_MAX_LABEL_LENGTH = 2;

export const VIM_SCROLL_LINE_PX = 60;

export const VIM_DISABLED_ATTRIBUTE = "data-vim-disabled";

export const TREE_ROW_SELECTOR = "[data-tree-row]";

export const TREE_ROOT_SELECTOR = "[data-tree-root]";

export const VIM_CONTENT_SELECTOR = "[data-scroll-root]";

export const VIM_HINT_ATTRIBUTES = {
  target: "data-vim-target",
  contextMenu: "data-vim-contextmenu",
  ctrlClick: "data-vim-ctrlclick",
  label: "data-vim-label",
} as const;
