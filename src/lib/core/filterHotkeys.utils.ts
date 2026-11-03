const HOTKEY_IGNORE_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [data-no-hotkeys], [data-hotkeys-disabled], [data-no-wheel]';

export function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(HOTKEY_IGNORE_SELECTOR));
}

const TEXT_ENTRY_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(TEXT_ENTRY_SELECTOR));
}

const PLAYER_ACTIVATION_CODES = new Set(["Space", "Enter", "NumpadEnter"]);

/**
 * Player shortcuts stay live while a control or the timeline has focus: only
 * text entry and explicit opt-outs swallow them. A focused button still keeps
 * Space and Enter for its own activation.
 */
export function shouldIgnorePlayerHotkeys(event: KeyboardEvent): boolean {
  const element = event.target instanceof HTMLElement ? event.target : null;
  if (!element) return false;
  const inRange = element.closest('input[type="range"]');
  if (inRange && event.code.startsWith("Arrow")) return false;
  if (isTextEntryTarget(event.target)) return true;
  if (element.closest("[data-no-hotkeys], [data-hotkeys-disabled]")) return true;
  if (element.closest("button") && PLAYER_ACTIVATION_CODES.has(event.code)) return true;
  return false;
}
