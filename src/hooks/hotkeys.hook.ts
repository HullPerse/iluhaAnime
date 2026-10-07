import { useEffect, useRef } from "react";

import type { HotkeyDef } from "@/lib/hotkeys/chord.hotkeys";
import { subscribeHotkeys } from "@/lib/hotkeys/registry.hotkeys";

export interface UseHotkeysOptions<TId extends string = string> {
  ignore?: (event: KeyboardEvent) => boolean;
  capture?: boolean;
  enabled?: boolean;
  target?: React.RefObject<HTMLElement | null>;
  onAction: (id: TId, event: KeyboardEvent) => void;
}

export function useHotkeys<TId extends string>(
  defs: readonly HotkeyDef<TId>[],
  options: UseHotkeysOptions<TId>
): void {
  const stateRef = useRef({ defs, options });
  useEffect(() => {
    stateRef.current = { defs, options };
  });

  const signature = defs.map((def) => `${def.id}:${def.chord}:${def.repeat}`).join("\n");

  useEffect(() => {
    const readOptions = () => stateRef.current.options;
    const node = readOptions().target?.current ?? window;
    return subscribeHotkeys(node, {
      defs: stateRef.current.defs,
      capture: readOptions().capture,
      ignore: (event) => readOptions().ignore?.(event) ?? false,
      onAction: (id, event) => {
        if (readOptions().enabled === false) return;
        readOptions().onAction(id, event);
      },
    });
  }, [signature]);
}
