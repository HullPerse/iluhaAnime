import type { PreviewAnchor } from "@/types/player/episodes.stream";

const PREVIEW_WIDTH = 176;
const PREVIEW_HEIGHT = 112;
const PREVIEW_GAP = 8;

export function previewPosition(
  rect: PreviewAnchor["rect"],
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const left = Math.max(PREVIEW_GAP, rect.left - PREVIEW_WIDTH - PREVIEW_GAP);
  const maxTop = Math.max(PREVIEW_GAP, viewport.height - PREVIEW_HEIGHT - PREVIEW_GAP);
  const rowCenter = (rect.top + rect.bottom) / 2;
  const top = Math.min(Math.max(PREVIEW_GAP, rowCenter - PREVIEW_HEIGHT / 2), maxTop);
  return { left, top };
}
