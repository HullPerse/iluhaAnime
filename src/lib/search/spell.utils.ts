import type { KeyboardEvent } from "react";

import type { HighlightToken } from "@/types/core/highlight";
import type { HighlightRange, SpellCheck, SpellWordSpan } from "@/types/search/search";

const EMPTY_SPELL_RANGES: readonly HighlightRange[] = [];

export const spellSpansOf = (check: SpellCheck | null): SpellWordSpan[] => {
  if (!check) return [];
  if (check.spans && check.spans.length > 0) return check.spans;
  return [
    {
      start: check.start,
      end: check.end,
      severity: check.severity,
      word: check.word,
      corrected: check.correction,
    },
  ];
};

export const spellRangeOf = (check: SpellCheck | null): readonly HighlightRange[] => {
  if (!check) return EMPTY_SPELL_RANGES;
  return spellSpansOf(check).map((span) => {
    const kind: HighlightRange["kind"] = span.severity === "error" ? "spell-error" : "spell-warn";
    return { start: span.start, end: span.end, kind };
  });
};

export const spellSeverityOf = (kind: HighlightToken["kind"]): "warn" | "error" | undefined => {
  if (kind === "spell-error") return "error";
  if (kind === "spell-warn") return "warn";
  return undefined;
};

export const spellRectsOf = (backdrop: HTMLDivElement | null): DOMRect[] => {
  if (!backdrop) return [];
  return [...backdrop.querySelectorAll("[data-spell]")]
    .filter((span): span is HTMLElement => span instanceof HTMLElement)
    .map((span) => span.getBoundingClientRect());
};

export const spellHit = (rect: DOMRect | null, clientX: number, clientY: number): boolean => {
  if (!rect) return false;
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top - 4 &&
    clientY <= rect.bottom + 4
  );
};

export const spellHitIndex = (rects: DOMRect[], clientX: number, clientY: number): number => {
  return rects.findIndex((rect) => spellHit(rect, clientX, clientY));
};

export const caretSpanIndex = (spans: SpellWordSpan[], selectionStart: number | null): number => {
  if (selectionStart == null) return -1;
  return spans.findIndex((span) => selectionStart >= span.start && selectionStart <= span.end);
};

export const handleSpellTab = (
  event: KeyboardEvent<HTMLInputElement>,
  spellCheck: SpellCheck | null,
  onApplySpellCorrection: ((spanIndex?: number) => void) | undefined
): boolean => {
  if (
    event.key !== "Tab" ||
    event.ctrlKey ||
    event.shiftKey ||
    !spellCheck ||
    !onApplySpellCorrection
  ) {
    return false;
  }
  event.preventDefault();
  const index = caretSpanIndex(spellSpansOf(spellCheck), event.currentTarget.selectionStart);
  onApplySpellCorrection(index < 0 ? undefined : index);
  return true;
};

export const handleSpellSaveTab = (
  event: KeyboardEvent<HTMLInputElement>,
  spellCheck: SpellCheck | null,
  onAddWordToDictionary: ((spanIndex?: number) => void) | undefined
): boolean => {
  if (
    event.key !== "Tab" ||
    !event.ctrlKey ||
    event.shiftKey ||
    !spellCheck ||
    !onAddWordToDictionary
  ) {
    return false;
  }
  event.preventDefault();
  const index = caretSpanIndex(spellSpansOf(spellCheck), event.currentTarget.selectionStart);
  onAddWordToDictionary(index < 0 ? undefined : index);
  return true;
};
