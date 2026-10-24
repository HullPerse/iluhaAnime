import { clamp } from "@/lib/utils/math.utils";

export type Domain = readonly [number, number];
export type Range = readonly [number, number];

export interface BandScale {
  bandwidth: number;
  step: number;
  position: (index: number) => number;
  center: (index: number) => number;
}

const EMPTY_BAND: BandScale = {
  bandwidth: 0,
  step: 0,
  position: () => 0,
  center: () => 0,
};

export function normalize(value: number, domain: Domain): number {
  if (!Number.isFinite(value)) return 0;
  const [min, max] = domain;
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

export function linearScale(domain: Domain, range: Range): (value: number) => number {
  const [from, to] = range;
  const span = to - from;
  return (value) => from + normalize(value, domain) * span;
}

export function bandScale(count: number, length: number, gap: number): BandScale {
  if (count <= 0 || length <= 0) return EMPTY_BAND;
  const safeGap = Math.max(0, gap);
  const available = Math.max(0, length - safeGap * (count - 1));
  const bandwidth = available / count;
  const step = bandwidth + safeGap;
  const position = (index: number) => index * step;
  return {
    bandwidth,
    step,
    position,
    center: (index: number) => position(index) + bandwidth / 2,
  };
}

function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / 10 ** exponent;
  let nice: number;
  if (fraction <= 1) nice = 1;
  else if (fraction <= 2) nice = 2;
  else if (fraction <= 2.5) nice = 2.5;
  else if (fraction <= 5) nice = 5;
  else nice = 10;
  return nice * 10 ** exponent;
}

function settle(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toPrecision(12));
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count <= 0) return [];
  if (max < min) return niceTicks(max, min, count);
  if (max === min) return [settle(min, 1)];
  const step = niceStep((max - min) / Math.max(1, count));
  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let value = first; value <= max + step * 1e-9; value += step) {
    ticks.push(settle(value, step));
  }
  return ticks;
}

export function niceMax(value: number, count = 5): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = niceStep(value / Math.max(1, count));
  return settle(Math.ceil(value / step) * step, step);
}
