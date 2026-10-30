import { scheduleTask } from "@/lib/core/shared.utils";

export const TARGET_FLASH_MS = 1300;

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
