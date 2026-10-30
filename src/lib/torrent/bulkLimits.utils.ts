export function parseBulkLimit(value: string): number | null {
  if (value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
