import { useCallback, useEffect, useRef, useState } from "react";

export function useDirtySinceMount(current: string): boolean {
  const mountRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);
  useEffect(() => {
    if (mountRef.current === null) mountRef.current = current;
    setDirty(mountRef.current !== current);
  }, [current]);
  return dirty;
}

export function useDiscardGuard(
  dirty: boolean,
  onClose: () => void
): { confirmDiscard: boolean; requestClose: () => void; cancelDiscard: () => void } {
  const [confirmDiscard, setConfirmDiscard] = useState<boolean>(false);
  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [dirty, onClose]);
  const cancelDiscard = useCallback(() => setConfirmDiscard(false), []);
  return { confirmDiscard, requestClose, cancelDiscard };
}
