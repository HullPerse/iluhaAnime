const BLUR_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button, [contenteditable="true"]';

export interface BlurGate {
  hintsOpen: boolean;
  topLayer: HTMLElement | null;
}

const FIND_BAR_SELECTOR = "[data-find-bar]";

/**
 * Whether Escape should drop keyboard focus instead of reaching other
 * handlers. Works with the vim mode on or off: Ctrl+K focuses the route main
 * input as a global feature, so Escape must unfocus it back everywhere. Only
 * skipped when no focusable target matches, a hint run owns the key, or a
 * layer (overlay, modal, menu) owns it. The overlay stack keeps priority
 * through `defaultPrevented` at the call site. The page-find bar opts out:
 * its input owns Escape (close the bar via the overlay stack), so blur must
 * not steal the key first - the blur listener runs in capture phase, ahead of
 * the overlay entry the bar registers when it opens.
 */
export function shouldBlurOnEscape(target: EventTarget | null, gate: BlurGate): boolean {
  if (gate.hintsOpen || gate.topLayer !== null) {
    return false;
  }
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(FIND_BAR_SELECTOR)) return false;
  return target.matches(BLUR_SELECTOR);
}

export function blurEditable(target: EventTarget | null): void {
  if (target instanceof HTMLElement) target.blur();
}
