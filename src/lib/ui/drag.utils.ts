export function formatVerticalDragTransform(
  transform: { x: number; y: number } | null
): string | undefined {
  if (!transform) return undefined;
  return `translate3d(0px, ${Math.round(transform.y)}px, 0)`;
}
