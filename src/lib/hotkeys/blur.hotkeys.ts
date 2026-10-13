const BLUR_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button, [contenteditable="true"]';

export interface BlurGate {
  vimMode: boolean;
  excludedRoute: boolean;
  hintsOpen: boolean;
  topLayer: HTMLElement | null;
}

/**
 * Whether Escape should drop keyboard focus instead of reaching other
 * handlers. Only when vim mode owns the surface, no layer or hint run owns
 * the key, and focus sits on a control that swallows vim chords (inputs,
 * selects, buttons). The overlay stack and the player surface keep priority.
 */
export function shouldBlurOnEscape(target: EventTarget | null, gate: BlurGate): boolean {
  if (!gate.vimMode || gate.excludedRoute || gate.hintsOpen || gate.topLayer !== null) {
    return false;
  }
  return target instanceof HTMLElement && target.matches(BLUR_SELECTOR);
}

export function blurEditable(target: EventTarget | null): void {
  if (target instanceof HTMLElement) target.blur();
}
