/**
 * Row bucketing (broad phase, Grid-style, not an R-tree): groups indices
 * whose tops fall in the same band. Every item here is roughly the same
 * size, so uniform banding wins over a tree - the same reason Matter.js
 * uses a uniform Grid for same-size bodies and reaches for R-trees only
 * for scattered worlds.
 *
 * Bands chain: tops 0/19/38 with gap 20 share one band, because each step
 * is within the gap. A band split therefore guarantees every cross-band
 * pair differs by at least the gap, so resolving per band is exactly
 * equivalent to resolving globally - the seam exists for a future grid,
 * the output does not change.
 */
export function bucketRows(tops: readonly number[], rowGap: number): number[][] {
  const order = tops.map((_, index) => index).sort((a, b) => tops[a] - tops[b]);
  const rows: number[][] = [];
  let previous = Number.NaN;
  for (const index of order) {
    const top = tops[index];
    const last = rows.at(-1);
    if (last && top - previous < rowGap) {
      last.push(index);
    } else {
      rows.push([index]);
    }
    previous = top;
  }
  return rows;
}
