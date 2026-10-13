/**
 * The top layer above the page: a dialog, a menu, a listbox, or anything
 * marked as a layer by hand. Base UI portals are appended to `body` in the
 * order they open, so the last visible match is the top of the stack.
 */
const LAYER_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[data-slot$="-content"]',
  "[data-vim-layer]",
].join(", ");

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function topLayerElement(root: ParentNode = document): HTMLElement | null {
  let top: HTMLElement | null = null;
  for (const element of root.querySelectorAll<HTMLElement>(LAYER_SELECTOR)) {
    if (isVisible(element)) top = element;
  }
  return top;
}

/** Whether the key event belongs to `layer` - the layer, or a control in it. */
export function isInsideLayer(target: EventTarget | null, layer: HTMLElement | null): boolean {
  if (!layer || !(target instanceof HTMLElement)) return false;
  return target === layer || layer.contains(target);
}

/**
 * Body class while hint badges are open. Hover-revealed controls (the card
 * stepper, row actions) stay visible for the layer duration so a badge never
 * points at an invisible target.
 */
export const VIM_HINTS_OPEN_CLASS = "vim-hints-open";

export function setHintsLayerVisible(open: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(VIM_HINTS_OPEN_CLASS, open);
}
