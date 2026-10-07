import type { AutocompleteMode, SearchSuggestion } from "@/types/search";

import { normalizeSearchText } from "./normalize.utils";

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
