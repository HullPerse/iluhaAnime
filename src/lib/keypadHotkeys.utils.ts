import { isTextEntryTarget } from "@/lib/filterHotkeys.utils";

export interface KeypadOptions {
  /** Physical `KeyboardEvent.code` to emulator key index. */
  keys: ReadonlyMap<string, number>;
  onKey: (key: number, pressed: boolean) => void;
}

/**
 * Captures the mapped keypad keys for the running game session: key state is
 * pressed/released (not a chord), repeats and modified presses are skipped,
 * text entry keeps its keys, and every held key is released on blur or when
 * the window is hidden so the VM never sticks.
 */
export function subscribeKeypad(target: Window, options: KeypadOptions): () => void {
  const { keys, onKey } = options;
  const held = new Set<number>();

  const releaseAll = (): void => {
    for (const key of held) {
      held.delete(key);
      onKey(key, false);
    }
  };

  const handleDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (isTextEntryTarget(event.target)) return;
    const key = keys.get(event.code);
    if (key === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (held.has(key)) return;
    held.add(key);
    onKey(key, true);
  };

  const handleUp = (event: KeyboardEvent): void => {
    const key = keys.get(event.code);
    if (key === undefined || !held.has(key)) return;
    held.delete(key);
    event.preventDefault();
    event.stopPropagation();
    onKey(key, false);
  };

  const handleBlur = (): void => releaseAll();

  const handleVisibility = (): void => {
    if (document.hidden) releaseAll();
  };

  target.addEventListener("keydown", handleDown, true);
  target.addEventListener("keyup", handleUp, true);
  target.addEventListener("blur", handleBlur);
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    target.removeEventListener("keydown", handleDown, true);
    target.removeEventListener("keyup", handleUp, true);
    target.removeEventListener("blur", handleBlur);
    document.removeEventListener("visibilitychange", handleVisibility);
    releaseAll();
  };
}
