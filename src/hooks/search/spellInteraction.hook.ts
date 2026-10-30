import type { RefObject } from "react";

import { spellHitIndex, spellRectsOf, spellSpansOf } from "@/lib/search/spell.utils";
import type { SpellCheck } from "@/types/search/search";

export function useSpellInteraction(
  backdropRef: RefObject<HTMLDivElement | null>,
  spellCheck: SpellCheck | null,
  onApplySpellCorrection?: (spanIndex?: number) => void,
  onAddWordToDictionary?: (spanIndex?: number) => void
) {
  const spellSpanRects = (): DOMRect[] => spellRectsOf(backdropRef.current);

  const handleSpellClick = (event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => {
    if (!spellCheck) return false;
    const index = spellHitIndex(spellSpanRects(), event.clientX, event.clientY);
    if (index < 0 || !spellSpansOf(spellCheck)[index]) return false;
    event.preventDefault();
    onApplySpellCorrection?.(index);
    return true;
  };

  const handleSpellContextMenu = (event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => {
    if (!spellCheck) return false;
    const index = spellHitIndex(spellSpanRects(), event.clientX, event.clientY);
    if (index < 0 || !spellSpansOf(spellCheck)[index]) return false;
    event.preventDefault();
    onAddWordToDictionary?.(index);
    return true;
  };

  return {
    handleSpellClick,
    handleSpellContextMenu,
  };
}
