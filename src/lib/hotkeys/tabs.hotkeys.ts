import { TREE_ROOT_SELECTOR, TREE_ROW_SELECTOR } from "@/config/keyboard/vim.config";
import { isTextEntryTarget } from "@/lib/hotkeys/filter.hotkeys";
import { topLayerElement } from "@/lib/hotkeys/layer.hotkeys";

/**
 * Steps an ordered tab id list with wrap-around. Pure index math so paged
 * rows (which render only a window) cycle over the full list: callers pass
 * their complete ids and apply the result through their own setter, which
 * re-windows the row for free.
 */
export function stepTabId<T extends string>(
  ids: readonly T[],
  activeId: string,
  delta: 1 | -1
): T | null {
  if (ids.length === 0) return null;
  const active = ids.indexOf(activeId as T);
  const from = active === -1 ? (delta > 0 ? -1 : 0) : active;
  return ids[(from + delta + ids.length) % ids.length] ?? null;
}

/**
 * Shared ignore for tab-cycle chords: never while typing, and never over an
 * open layer, so background tabs do not switch under a modal.
 */
export function ignoreTabCycle(event: KeyboardEvent): boolean {
  return isTextEntryTarget(event.target) || topLayerElement() !== null;
}

function parentDir(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut < 0 ? "" : path.slice(0, cut);
}

/**
 * Focuses the Nth sibling row (1-based) of the tree holding the row: `0` or
 * out-of-range clamps to the first row, negative counts from the end (`-1`
 * is the last sibling). Siblings share the parent directory of the row path
 * inside the nearest tree root, so jumps never leak into another tree.
 * Returns false when there is nothing to focus.
 */
export function focusTreeSibling(row: HTMLElement, index: number): boolean {
  const path = row.dataset.treePath;
  const root = row.closest<HTMLElement>(TREE_ROOT_SELECTOR);
  if (!path || !root) return false;
  const parent = parentDir(path);
  const siblings = [...root.querySelectorAll<HTMLElement>(TREE_ROW_SELECTOR)].filter(
    (element) => parentDir(element.dataset.treePath ?? "") === parent
  );
  if (siblings.length === 0) return false;
  const at = index < 0 ? siblings.length + index : index - 1;
  const target = siblings[Math.min(Math.max(at, 0), siblings.length - 1)];
  target?.focus();
  return target !== undefined;
}
