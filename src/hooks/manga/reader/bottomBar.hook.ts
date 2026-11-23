import { useCallback, useEffect, useRef, useState } from "react";

export const READER_BOTTOM_BAR_HIDE_MS = 3000;
export const READER_BOTTOM_BAR_REVEAL_ZONE = 120;
export const READER_TOP_BAR_REVEAL_ZONE = 120;

export function useReaderBar({ always, pinned }: { always: boolean; pinned: boolean }) {
  const [visible, setVisible] = useState<boolean>(true);
  const shown = useRef<boolean>(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((value: boolean) => {
    if (shown.current === value) return;
    shown.current = value;
    setVisible(value);
  }, []);
  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const release = useCallback(() => {
    clear();

    if (always || pinned) return;
    timer.current = setTimeout(() => update(false), READER_BOTTOM_BAR_HIDE_MS);
  }, [always, pinned, clear, update]);
  const reveal = useCallback(() => {
    update(true);
    release();
  }, [release, update]);
  const hold = useCallback(() => {
    clear();
    update(true);
  }, [clear, update]);

  useEffect(() => {
    if (always || pinned) {
      clear();
      update(true);

      return clear;
    }

    reveal();

    return clear;
  }, [always, pinned, reveal, clear, update]);

  return { shown: visible, reveal, hold, release };
}

export const useReaderBottomBar = useReaderBar;
