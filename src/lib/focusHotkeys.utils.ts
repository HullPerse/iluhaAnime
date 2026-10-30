export const MAIN_SEARCH_SELECTOR = "[data-main-search]";

export function focusMainSearch(root: ParentNode = document): boolean {
  const target =
    root instanceof Document || root instanceof HTMLElement
      ? root.querySelector<HTMLElement>(MAIN_SEARCH_SELECTOR)
      : null;
  if (!target || typeof target.focus !== "function") return false;
  target.focus();
  return true;
}
