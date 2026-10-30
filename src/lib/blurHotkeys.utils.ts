const BLUR_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button, [contenteditable="true"]';

export interface BlurGate {
  hintsOpen: boolean;
  topLayer: HTMLElement | null;
}

const FIND_BAR_SELECTOR = "[data-find-bar]";

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
