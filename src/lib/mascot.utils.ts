export interface OverlapRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const MASCOT_DIM_COVERAGE = 0.2;

export function overlapCoverage(mascot: OverlapRect, panel: OverlapRect): number {
  const width = Math.min(mascot.right, panel.right) - Math.max(mascot.left, panel.left);
  const height = Math.min(mascot.bottom, panel.bottom) - Math.max(mascot.top, panel.top);
  const area = (mascot.right - mascot.left) * (mascot.bottom - mascot.top);
  if (width <= 0 || height <= 0 || area <= 0) return 0;
  return (width * height) / area;
}

export function shouldDimMascot(mascot: OverlapRect, panel: OverlapRect): boolean {
  return overlapCoverage(mascot, panel) >= MASCOT_DIM_COVERAGE;
}
