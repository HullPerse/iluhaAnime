import * as z from "zod/mini";

import data from "./vim.data.json";

const VimDataSchema = z.object({
  TREE_ROOT_SELECTOR: z.string(),
  TREE_ROW_SELECTOR: z.string(),
  VIM_CONTENT_SELECTOR: z.string(),
  VIM_DISABLED_ATTRIBUTE: z.string(),
  VIM_HINT_ATTRIBUTES: z.object({
    contextMenu: z.string(),
    ctrlClick: z.string(),
    label: z.string(),
    target: z.string(),
  }),
  VIM_LABEL_ALPHABET: z.string(),
  VIM_MAX_LABEL_LENGTH: z.number(),
  VIM_MOTION_KEYS: z.object({
    edgeBottom: z.string(),
    edgeMiddle: z.string(),
    edgeTop: z.string(),
    first: z.string(),
    firstPrefix: z.string(),
    last: z.string(),
  }),
  VIM_SCROLL_KEYS: z.object({
    halfDown: z.string(),
    halfUp: z.string(),
    lineDown: z.string(),
    lineUp: z.string(),
  }),
  VIM_SCROLL_LINE_PX: z.number(),
  VIM_TRIGGER_CHORD: z.string(),
});

const parsed = VimDataSchema.parse(data);

export const VIM_TRIGGER_CHORD = parsed.VIM_TRIGGER_CHORD;
export const VIM_SCROLL_KEYS = parsed.VIM_SCROLL_KEYS as {
  lineDown: "KeyJ";
  lineUp: "KeyK";
  halfDown: "KeyD";
  halfUp: "KeyU";
};
export const VIM_MOTION_KEYS = parsed.VIM_MOTION_KEYS as {
  firstPrefix: "KeyG";
  first: "KeyG";
  last: "Shift+KeyG";
  edgeTop: "KeyH";
  edgeMiddle: "KeyM";
  edgeBottom: "KeyL";
};
export const VIM_LABEL_ALPHABET = parsed.VIM_LABEL_ALPHABET;
export const VIM_MAX_LABEL_LENGTH = parsed.VIM_MAX_LABEL_LENGTH;
export const VIM_SCROLL_LINE_PX = parsed.VIM_SCROLL_LINE_PX;
export const VIM_DISABLED_ATTRIBUTE = parsed.VIM_DISABLED_ATTRIBUTE;
export const TREE_ROW_SELECTOR = parsed.TREE_ROW_SELECTOR;
export const TREE_ROOT_SELECTOR = parsed.TREE_ROOT_SELECTOR;
export const VIM_CONTENT_SELECTOR = parsed.VIM_CONTENT_SELECTOR;
export const VIM_HINT_ATTRIBUTES = parsed.VIM_HINT_ATTRIBUTES as {
  target: "data-vim-target";
  contextMenu: "data-vim-contextmenu";
  ctrlClick: "data-vim-ctrlclick";
  label: "data-vim-label";
};