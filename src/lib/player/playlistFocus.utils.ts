/**
 * Next focused playlist row for the list keys. The ring starts on the row that
 * is playing (or the first row when nothing is playing) and clamps at both
 * ends instead of wrapping, so holding `j` stops on the last item. A focus
 * past the end - the playlist shrank while the panel was open - is clamped
 * back into range rather than dropped.
 */
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
