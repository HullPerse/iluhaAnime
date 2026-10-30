export type HintVariant = "plain" | "ctrl" | "contextmenu" | "focus";

export interface HintBadge {
  element: HTMLElement;
  label: string;
  variant: HintVariant;
}

export interface HintScanResult {
  badges: HintBadge[];
  overflow: number;
}

export interface HintScanOptions {
  max?: number;
  alphabet?: string;
  maxLabelLength?: number;
}

export interface HintBadgeLayout {
  label: string;
  variant: HintVariant;
  description: string;
  pinned: boolean;
  top: number;
  left: number;
}

export type HintKeyOutcome = "activate" | "pin" | "buffer" | "clear";

export interface HintKeyResult {
  outcome: HintKeyOutcome;
  badge?: HintBadge;
  buffer: string;
}
