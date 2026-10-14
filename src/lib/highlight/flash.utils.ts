import { scheduleTask } from "@/lib/pacer/shared.utils";

/** The CSS animation runs for 1.2s; the class is dropped slightly later. */
export const TARGET_FLASH_MS = 1300;

/**
 * Applies the shared `.target-flash` outline to an element and returns a
 * cleanup that removes it (also on unmount-style interruption).
 */
export function flashTarget(element: Element): () => void {
  element.classList.add("target-flash");
  const timer = scheduleTask("timeout", TARGET_FLASH_MS, () => {
    element.classList.remove("target-flash");
  });
  return () => {
    timer.cancel();
    element.classList.remove("target-flash");
  };
}
