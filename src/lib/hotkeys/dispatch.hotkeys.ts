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

/**
 * Clicks a file row's own action button (`data-file-action`), unwrapping the
 * span some triggers render in. Menu entries, row keys and tests all go
 * through this one lookup, so the three paths cannot disagree about which
 * button an action means. A disabled button's `click()` is a no-op, which is
 * exactly the disabled/busy guard the mouse path enforces.
 */
export function clickRowActionButton(row: HTMLElement | null, name: string): void {
  const holder = row?.querySelector<HTMLElement>(`[data-file-action="${name}"]`);
  const button =
    holder?.tagName === "BUTTON" ? holder : holder?.querySelector<HTMLElement>("button");
  button?.click();
}
