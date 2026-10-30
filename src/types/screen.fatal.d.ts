import type { FatalInfo } from "@/types/fatal";

export interface FatalScreenProps {
  info: FatalInfo;
  safe?: boolean;
  onReload: () => void;
  onSafeReload: () => void;
  onRetry: () => void;
}
