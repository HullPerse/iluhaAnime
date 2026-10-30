import type { ThemeState } from "@/types/graphics/tokens";

export interface ThemePrePaintPayload {
  schema: number;
  themeName: string;
  vars: Record<string, string>;
  overrides: Record<string, string>;
  datasets: ThemeState["datasets"];
  fontFamily: string | null;
}
