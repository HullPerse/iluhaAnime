import type { HighlightRange } from "@/types/search/search";

export interface HighlightToken {
  text: string;
  highlighted: boolean;
  kind?: HighlightRange["kind"];
}
