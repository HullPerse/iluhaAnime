export function gridColumns(element: HTMLElement | null): number {
  if (!element) return 1;
  const template = getComputedStyle(element).gridTemplateColumns;
  const count = template.split(" ").filter(Boolean).length;
  return Math.max(1, count);
}
