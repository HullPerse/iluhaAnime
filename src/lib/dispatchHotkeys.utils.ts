import type { ClickVariant } from "@/types/dispatchHotkeys";

export function dispatchClick(element: Element, variant: ClickVariant): MouseEvent {
  const contextMenu = variant === "contextmenu";
  const modified = variant === "ctrl";
  const event = new MouseEvent(contextMenu ? "contextmenu" : "click", {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: contextMenu ? 2 : 0,
    buttons: contextMenu ? 2 : 1,
    ctrlKey: modified,
    metaKey: modified,
  });
  element.dispatchEvent(event);
  return event;
}

export function dispatchFocus(element: Element): void {
  if (element instanceof HTMLElement) element.focus();
}

export function clickRowActionButton(row: HTMLElement | null, name: string): void {
  const holder = row?.querySelector<HTMLElement>(`[data-file-action="${name}"]`);
  const button =
    holder?.tagName === "BUTTON" ? holder : holder?.querySelector<HTMLElement>("button");
  button?.click();
}
