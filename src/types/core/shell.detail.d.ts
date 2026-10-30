import type { ReactNode } from "react";

export interface DetailShellSlot {
  title: string;
  actions: ReactNode;
  onBack: (() => void) | undefined;
  body: ReactNode;
}
