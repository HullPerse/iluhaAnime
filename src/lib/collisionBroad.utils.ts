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
