import { useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): { call: (...args: Parameters<T>) => void; cancel: () => void } {
  const ref = useRef<ReturnType<typeof setTimeout>>(undefined);

  const call = (...args: Parameters<T>) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => callback(...args), delay);
  };

  const cancel = () => {
    if (ref.current) clearTimeout(ref.current);
  };

  useEffect(() => () => cancel(), []);

  return { call, cancel };
}
