import type { ReactNode } from "react";

export interface ModalHostContent {
  header: string;
  body: ReactNode;
  className?: string;
  headerActions?: ReactNode;
}
