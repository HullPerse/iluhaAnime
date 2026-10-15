import { Debouncer } from "@/lib/pacer/debounce.utils";

export const PIN_DESCRIPTION_MS = 3000;

export function createPinTimer(
  onExpire: () => void,
  waitMs: number = PIN_DESCRIPTION_MS
): Debouncer<[]> {
  return new Debouncer<[]>(onExpire, { wait: waitMs });
}
