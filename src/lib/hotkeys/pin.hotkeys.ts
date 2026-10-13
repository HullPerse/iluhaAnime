import { Debouncer } from "@/lib/pacer/debounce.utils";

/** How long a pinned description stays grown before it falls back to the letter. */
export const PIN_DESCRIPTION_MS = 3000;

/**
 * One-shot trailing timer that clears a pinned description. Re-arming
 * restarts the wait; cancel drops it. Backed by the pacer engine so the
 * timing behavior matches the debounced saves elsewhere.
 */
export function createPinTimer(
  onExpire: () => void,
  waitMs: number = PIN_DESCRIPTION_MS
): Debouncer<[]> {
  return new Debouncer<[]>(onExpire, { wait: waitMs });
}
