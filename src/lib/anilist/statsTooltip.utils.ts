import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import type { Locale } from "@/types/core/i18n";

export function statsTooltipRow(count: number, label: string, locale: Locale) {
  return { label, value: formatCompact(count, locale) };
}
