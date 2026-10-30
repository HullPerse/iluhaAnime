// Hover lookup and segment math for the in-house charts module.
// Budget (avg/iter, Ryzen 7 5800X/node 26, 2026-10-24): nearest 32 marks
// 997us hybrid vs 916us pure linear, nearest 400 marks 201us hybrid vs 179us
// pure binary. Per hover event that is 15 to 17 ns, so the hybrid is kept:
// linear under 32 marks, binary above. Ratio segments 1.07ms per 20k runs,
// band layout 11.06ms, bar lengths 1.39ms, ticks 16.43ms. Regression
// threshold is labs minDelta 5%.

import { bench, group } from "@pmndrs/labs";

import { barLength, nearestIndex, ratioSegments } from "../../src/lib/core/geometry.utils";
import { bandScale, niceTicks } from "../../src/lib/core/scale.utils";

const SMALL = [8, 16, 32].map((count) =>
  Array.from({ length: count }, (_, index) => index * 24 + 12)
);
const LARGE = Array.from({ length: 400 }, (_, index) => index * 3 + 0.5);

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

function binaryNearest(sorted: readonly number[], target: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < target) low = middle + 1;
    else high = middle;
  }
  const previous = low - 1;
  if (previous < 0) return low;
  return Math.abs(sorted[previous]! - target) <= Math.abs(sorted[low]! - target)
    ? previous
    : low;
}

let cursor = 0;
function target(): number {
  cursor = (cursor + 37) % 600;
  return cursor * 1.7;
}

group("charts @charts @quick", () => {
  bench("nearest hybrid, 32 marks x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) {
      for (const mark of SMALL) sum += nearestIndex(mark, target());
    }
    return sum;
  });

  bench("nearest linear, 32 marks x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) {
      for (const mark of SMALL) sum += linearNearest(mark, target());
    }
    return sum;
  });

  bench("nearest hybrid, 400 marks x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) sum += nearestIndex(LARGE, target());
    return sum;
  });

  bench("nearest single pass, 400 marks x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) sum += binaryNearest(LARGE, target());
    return sum;
  });

  bench("ratio segments x20k", () => {
    const values = [210, 42, 18, 11, 7, 4];
    let sum = 0;
    for (let index = 0; index < 20_000; index++) {
      for (const segment of ratioSegments(values, 720)) sum += segment.length;
    }
    return sum;
  });

  bench("band layout for 20 bars x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) {
      const scale = bandScale(20, 720, 3);
      sum += scale.center(index % 20) + scale.bandwidth;
    }
    return sum;
  });

  bench("bar lengths for 20 values x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) {
      for (let mark = 0; mark < 20; mark++) sum += barLength(mark * 13, 260, 240);
    }
    return sum;
  });

  bench("ticks for 0..300 x20k", () => {
    let sum = 0;
    for (let index = 0; index < 20_000; index++) {
      for (const tick of niceTicks(0, 300, 5)) sum += tick;
    }
    return sum;
  });
});
