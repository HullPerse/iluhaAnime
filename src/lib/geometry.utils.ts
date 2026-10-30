const LINEAR_SCAN_LIMIT = 32;

export interface RatioSegment {
  start: number;
  length: number;
}

export function barLength(value: number, max: number, length: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || length <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, value / max));
  return ratio * length;
}

export function ratioSegments(values: readonly number[], length: number): RatioSegment[] {
  const safeLength = Number.isFinite(length) && length > 0 ? length : 0;
  let total = 0;
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) total += value;
  }
  if (total <= 0 || safeLength <= 0) {
    return values.map(() => ({ start: 0, length: 0 }));
  }
  const segments: RatioSegment[] = [];
  let share = 0;
  let cursor = 0;
  for (const value of values) {
    share += (Number.isFinite(value) && value > 0 ? value : 0) / total;
    const end = Math.round(share * safeLength);
    segments.push({ start: cursor, length: Math.max(0, end - cursor) });
    cursor = end;
  }
  return segments;
}

function linearNearest(sorted: readonly number[], target: number): number {
  let best = 0;
  let bestDistance = Math.abs(sorted[0]! - target);
  for (let index = 1; index < sorted.length; index++) {
    const distance = Math.abs(sorted[index]! - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Expects ascending values, such as mark centers or band boundaries.
 */
export function nearestIndex(sorted: readonly number[], target: number): number {
  if (sorted.length === 0) return -1;
  if (!Number.isFinite(target)) return 0;
  if (sorted.length <= LINEAR_SCAN_LIMIT) return linearNearest(sorted, target);

  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < target) low = middle + 1;
    else high = middle;
  }
  const previous = low - 1;
  if (previous < 0) return low;
  return Math.abs(sorted[previous]! - target) <= Math.abs(sorted[low]! - target) ? previous : low;
}
