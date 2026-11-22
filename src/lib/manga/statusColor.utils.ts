import { statusColors } from "@/config/manga/status.config";

export function mangaStatusColor(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;

  return statusColors[color] ?? "var(--color-text)";
}
