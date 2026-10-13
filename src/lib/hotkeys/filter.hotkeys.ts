const HOTKEY_IGNORE_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [data-no-hotkeys], [data-hotkeys-disabled], [data-no-wheel]';

export function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(HOTKEY_IGNORE_SELECTOR));
}

const TEXT_ENTRY_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';

/**
 * Narrower than {@link shouldIgnoreHotkeys}: only targets that actually take
 * typed text. Focused buttons, links and rows must keep working - typing a
 * chord there prints nothing and collides with nothing (e.g. cycling tabs
 * while a status button holds focus).
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(TEXT_ENTRY_SELECTOR));
}
