export function truncateLabel(label: string, maxChars: number): string {
  if (maxChars <= 3) return label.slice(0, Math.max(0, maxChars));
  if (label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 3)}...`;
}
