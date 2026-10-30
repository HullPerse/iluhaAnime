import type { InputHTMLAttributes } from "react";

import { cn } from "cn";

import { getAriaAutocomplete } from "@/lib/search/searchHighlight.utils";
import type { AutocompleteMode, SearchSuggestion } from "@/types/search/search";

type FieldA11y = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "aria-activedescendant"
  | "aria-autocomplete"
  | "aria-controls"
  | "aria-expanded"
  | "aria-haspopup"
>;

export const autocompleteFieldA11y = (
  listboxId: string,
  activeIndex: number,
  activeSuggestion: SearchSuggestion | undefined,
  showMenu: boolean,
  mode: AutocompleteMode,
  enabled: boolean
): FieldA11y => {
  return {
    "aria-activedescendant": activeSuggestion ? `${listboxId}-${activeIndex}` : undefined,
    "aria-autocomplete": getAriaAutocomplete(mode),
    "aria-controls": showMenu ? listboxId : undefined,
    "aria-expanded": showMenu || undefined,
    "aria-haspopup": enabled ? "listbox" : undefined,
  };
};

export const autocompleteFieldClassName = (hasHighlight: boolean) => {
  return cn(
    "relative z-10 h-full w-full bg-transparent",
    hasHighlight && "selection:bg-highlight/30 caret-text text-transparent"
  );
};
