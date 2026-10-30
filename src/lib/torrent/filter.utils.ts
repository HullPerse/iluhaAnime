export function firstPrefixMatch(names: readonly string[], query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return "";
  const lower = trimmed.toLowerCase();
  const match = names.find((name) => name.toLowerCase().startsWith(lower));
  return match !== undefined && match.length > query.length ? match : "";
}
