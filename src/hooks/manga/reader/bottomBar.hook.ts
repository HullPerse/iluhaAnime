import { useCallback, useEffect, useRef, useState } from "react";

export const READER_BOTTOM_BAR_HIDE_MS = 3000;
export const READER_BOTTOM_BAR_REVEAL_ZONE = 120;

export function useReaderBottomBar({ always, pinned }: { always: boolean; pinned: boolean }) {
  const [shown, setShown] = useState<boolean>(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const release = useCallback(() => {
    clear();

    if (always || pinned) return;
    timer.current = setTimeout(() => setShown(false), READER_BOTTOM_BAR_HIDE_MS);
  }, [always, pinned, clear]);
  const reveal = useCallback(() => {
    setShown(true);
    release();
  }, [release]);
  const hold = useCallback(() => {
    clear();
    setShown(true);
  }, [clear]);

  useEffect(() => {
    if (always || pinned) {
      clear();
      setShown(true);

      return clear;
    }

    reveal();

    return clear;
  }, [always, pinned, reveal, clear]);

  return { shown, reveal, hold, release };
}
