import { useCallback, useState } from "react";

export function useModalManager<T extends string>() {
  const [active, setActive] = useState<T | null>(null);

  const open = useCallback((modal: T) => setActive(modal), []);
  const close = useCallback(() => setActive(null), []);
  const toggle = useCallback(
    (modal: T) => setActive((prev) => (prev === modal ? null : modal)),
    [],
  );
  const isOpen = useCallback((modal: T) => active === modal, [active]);

  return { active, open, close, toggle, isOpen } as const;
}

export function useModalState(initial = false) {
  const [isOpen, setOpen] = useState(initial);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return { isOpen, open, close, toggle } as const;
}
