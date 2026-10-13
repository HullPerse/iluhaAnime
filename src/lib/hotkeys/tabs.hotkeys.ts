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
