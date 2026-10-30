export function movePlaylistFocus(
  focus: number | null,
  activeIndex: number,
  count: number,
  delta: number
): number | null {
  if (count <= 0) return null;
  const base = focus ?? Math.max(activeIndex, 0);
  return Math.min(count - 1, Math.max(0, base + delta));
}
