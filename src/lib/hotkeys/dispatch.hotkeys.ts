export type ClickVariant = "plain" | "ctrl" | "contextmenu";

/**
 * Dispatches a real, bubbling MouseEvent at the target so React's root
 * delegation and the existing `e.ctrlKey`/`e.metaKey` checks see the same
 * shape a mouse gesture produces.
 */
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

/** Focuses an editable hint target: typing into it is the action. */
export function dispatchFocus(element: Element): void {
  if (element instanceof HTMLElement) element.focus();
}
