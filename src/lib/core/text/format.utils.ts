import type { ReactNode } from "react";

export function suffixText(suffix: ReactNode): string {
  return typeof suffix === "string" ? suffix : "";
}
