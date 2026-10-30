import { useEffect, useState } from "react";

import { fetchVideoCard, getCachedCard } from "@/lib/core/cardCache.utils";
import type { CardArt } from "@/types/core/cardCache";
import { ignore } from "@/lib/core/promise.utils";

export function useCardArt(path: string, visible: boolean): CardArt | null {
  const [art, setArt] = useState<CardArt | null>(() => getCachedCard(path));

  useEffect(() => {
    if (!visible || !path) return;
    const cached = getCachedCard(path);
    if (cached) {
      setArt(cached);
      return;
    }
    let disposed = false;
    ignore(
      fetchVideoCard(path).then((card) => {
        if (!disposed && card) setArt(card);
        return null;
      })
    );
    return () => {
      disposed = true;
    };
  }, [path, visible]);

  return art;
}
