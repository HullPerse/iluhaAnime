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

export function isInsideLayer(target: EventTarget | null, layer: HTMLElement | null): boolean {
  if (!layer || !(target instanceof HTMLElement)) return false;
  return target === layer || layer.contains(target);
}

export const VIM_HINTS_OPEN_CLASS = "vim-hints-open";

export function setHintsLayerVisible(open: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(VIM_HINTS_OPEN_CLASS, open);
}
