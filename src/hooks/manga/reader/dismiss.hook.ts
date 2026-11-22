import { useEffect } from "react";
import type { RefObject } from "react";

export function useDismissOnOutside<T extends HTMLElement>(
  open: boolean,
  ref: RefObject<T | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onDismiss, open, ref]);
}
