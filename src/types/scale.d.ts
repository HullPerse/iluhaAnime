export type Domain = readonly [number, number];

export type Range = readonly [number, number];

export interface BandScale {
  bandwidth: number;
  step: number;
  position: (index: number) => number;
  center: (index: number) => number;
}
