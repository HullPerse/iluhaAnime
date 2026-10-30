import { scheduleTask } from "@/lib/core/shared.utils";
import type { ScheduledTask } from "@/types/core/shared";
import type { SequenceOptions } from "@/types/core/sequenceHotkeys";

/**
 * Observes a key sequence (e.g. the Konami code) without claiming the keys:
 * no preventDefault, no stopPropagation, modified keys are skipped instead of
 * resetting progress, and the buffer resets on timeout or target blur.
 */
export function subscribeSequence(
  target: Window | HTMLElement,
  options: SequenceOptions
): () => void {
  const { codes, timeoutMs } = options.sequence;
  if (codes.length === 0) return () => {};

  let progress = 0;
  let recent: string[] = [];
  let timer: ScheduledTask | null = null;

  const clearTimer = (): void => {
    timer?.cancel();
    timer = null;
  };

  const reset = (): void => {
    progress = 0;
    recent = [];
    clearTimer();
  };

  const armTimer = (): void => {
    clearTimer();
    timer = scheduleTask("timeout", timeoutMs, () => {
      timer = null;
      reset();
    });
  };

  const suffixProgress = (): number => {
    const max = Math.min(recent.length, codes.length - 1);
    for (let length = max; length >= 1; length--) {
      let matches = true;
      for (let index = 0; index < length; index++) {
        if (recent[recent.length - length + index] !== codes[index]) {
          matches = false;
          break;
        }
      }
      if (matches) return length;
    }
    return 0;
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.repeat) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (options.ignore?.(event)) return;

    recent.push(event.code);
    if (recent.length > codes.length) recent.shift();

    if (event.code === codes[progress]) {
      progress += 1;
      if (progress >= codes.length) {
        reset();
        options.onMatch();
        return;
      }
      armTimer();
      return;
    }

    progress = suffixProgress();
    if (progress > 0) armTimer();
    else clearTimer();
  };

  const listener = (event: Event): void => {
    if (event instanceof KeyboardEvent) handleKeyDown(event);
  };

  target.addEventListener("keydown", listener);
  target.addEventListener("blur", reset);
  return () => {
    target.removeEventListener("keydown", listener);
    target.removeEventListener("blur", reset);
    clearTimer();
  };
}
