import type { FatalInfo, FatalTexts } from "@/types/fatal";
import type { RefObject } from "react";

export interface FatalVariantProps {
  info: FatalInfo;
  texts: FatalTexts;
  canRetry: boolean;
  safe: boolean;
  detailsOpen: boolean;
  copied: boolean;
  reloadRef: RefObject<HTMLButtonElement | null>;
  onToggleDetails: () => void;
  onReload: () => void;
  onSafeReload: () => void;
  onRetry: () => void;
  onCopy: () => void;
}
