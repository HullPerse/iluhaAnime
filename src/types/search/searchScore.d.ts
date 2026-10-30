export interface OperatorTerm {
  negate: boolean;
  mode: OperatorMode;
  text: string;
}

export type OperatorMode = "fuzzy" | "exact" | "prefix" | "suffix" | "full";
