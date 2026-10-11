import type { RefObject } from "react";

import type { FatalInfo, FatalTexts } from "@/types/fatal";

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

export function formatFatalCopy(info: FatalInfo): string {
  const lines = [
    `[fatal.${info.kind}] scope=${info.scope} route=${info.route} theme=${info.themeName} time=${new Date(info.timestamp).toISOString()}`,
    info.message,
  ];
  if (info.stack) lines.push(info.stack);
  return lines.join("\n");
}
