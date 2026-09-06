import type { Source } from "@/types";

export function resolveInitialSource(visibleSources: string[], defaultSource: string): string {
  if (visibleSources.includes(defaultSource)) return defaultSource;
  return visibleSources[0] ?? "";
}

export function isPagedSearchSource(source: Source): boolean {
  return source === "nyaa" || source === "nekobt" || source === "sukebei";
}

export function serverSideSortSource(source: Source): boolean {
  return source === "nyaa" || source === "sukebei";
}
