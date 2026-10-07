const HOTKEY_IGNORE_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [data-no-hotkeys], [data-hotkeys-disabled], [data-no-wheel]';

export function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(HOTKEY_IGNORE_SELECTOR));
}
