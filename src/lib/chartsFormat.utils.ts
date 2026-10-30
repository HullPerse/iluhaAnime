import type { Locale } from "@/types/i18n";

const compactCache = new Map<string, Intl.NumberFormat>();
const percentCache = new Map<string, Intl.NumberFormat>();

function compactFormatter(locale: Locale): Intl.NumberFormat {
  let formatter = compactCache.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compactCache.set(locale, formatter);
  }
  return formatter;
}

function percentFormatter(locale: Locale, digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`;
  let formatter = percentCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: digits,
    });
    percentCache.set(key, formatter);
  }
  return formatter;
}

export function formatCompact(value: number, locale: Locale): string {
  if (!Number.isFinite(value)) return "0";
  return compactFormatter(locale).format(value);
}

export function formatPercent(ratio: number, locale: Locale, digits = 0): string {
  if (!Number.isFinite(ratio)) return percentFormatter(locale, digits).format(0);
  return percentFormatter(locale, digits).format(ratio);
}
