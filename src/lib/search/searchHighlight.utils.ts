import type { AutocompleteMode, SearchSuggestion } from "@/types/search/search";

import { normalizeSearchText } from "@/lib/core/normalize.utils";

const ARIA_MODES: Partial<Record<AutocompleteMode, "inline" | "both" | "list">> = {
  inline: "inline",
  both: "both",
  dropdown: "list",
};

export function getAriaAutocomplete(mode: AutocompleteMode): "inline" | "both" | "list" | "none" {
  return ARIA_MODES[mode] ?? "none";
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
