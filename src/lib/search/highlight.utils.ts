import type {
  AutocompleteMode,
  HighlightRange,
  HighlightSegment,
  HighlightToken,
  SearchSuggestion,
} from "@/types/search";

import { normalizeSearchText } from "./normalize.utils";

export function matchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase();
}

export function splitHighlighted(value: string, query: string): HighlightSegment[] {
  const needle = matchKey(query);
  if (!needle) return [{ text: value, matched: false }];

  const segments: HighlightSegment[] = [];
  let queryIndex = 0;
  let cursor = 0;
  let matched = false;

  for (let index = 0; index < value.length; index++) {
    const isMatch = queryIndex < needle.length && matchKey(value[index]) === needle[queryIndex];
    if (isMatch) {
      if (!matched) {
        if (index > cursor) {
          segments.push({ text: value.slice(cursor, index), matched: false });
        }
        cursor = index;
        matched = true;
      }
      queryIndex += 1;
    } else if (matched) {
      segments.push({ text: value.slice(cursor, index), matched: true });
      cursor = index;
      matched = false;
    }
  }

  segments.push({ text: value.slice(cursor), matched });
  return segments;
}

export function splitHighlightRanges(
  value: string,
  ranges: readonly HighlightRange[]
): HighlightToken[] {
  const sorted = [...ranges]
    .filter((r) => r.start < r.end && r.start < value.length)
    .sort((a, b) => a.start - b.start);
  const segments: HighlightToken[] = [];
  let cursor = 0;
  for (const r of sorted) {
    const start = Math.max(0, r.start);
    const end = Math.min(value.length, r.end);
    if (start < cursor) continue;
    if (start > cursor) segments.push({ text: value.slice(cursor, start), highlighted: false });
    segments.push({ text: value.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), highlighted: false });
  return segments;
}

export function getAriaAutocomplete(mode: AutocompleteMode): "inline" | "both" | "list" | "none" {
  if (mode === "inline") return "inline";
  if (mode === "both") return "both";
  if (mode === "dropdown") return "list";
  return "none";
}

export function computeGhostValue({
  mode,
  enabled,
  dismissed,
  focused,
  activeSuggestion,
  completion,
  currentValue,
}: {
  mode: AutocompleteMode;
  enabled: boolean;
  dismissed: boolean;
  focused: boolean;
  activeSuggestion?: SearchSuggestion;
  completion?: string | null;
  currentValue: string;
}): string | null {
  if (!enabled) return null;
  if (mode !== "inline" && mode !== "both") return null;
  if (dismissed || !focused) return null;
  const candidate = activeSuggestion?.value ?? completion ?? null;
  if (!candidate) return null;
  if (currentValue.trim().length === 0) return null;
  const normCandidate = normalizeSearchText(candidate);
  const normCurrent = normalizeSearchText(currentValue);
  if (!normCandidate.startsWith(normCurrent) || normCandidate === normCurrent) {
    return null;
  }
  return candidate;
}
