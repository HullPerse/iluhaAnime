import { useEffect, useState } from "react";

export function useSessionPeak(value: number): number {
  const [peak, setPeak] = useState<number>(0);
  useEffect(() => {
    setPeak((previous) => Math.max(previous, value));
  }, [value]);
  return Math.max(peak, value, 1);
}
