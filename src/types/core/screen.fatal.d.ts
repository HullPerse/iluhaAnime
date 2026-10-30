import type { FatalInfo } from "@/types/core/fatal";

export interface FatalScreenProps {
  info: FatalInfo;
  safe?: boolean;
  onReload: () => void;
  onSafeReload: () => void;
  onRetry: () => void;
}
