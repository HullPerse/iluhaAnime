export interface HSVA {
  h: number;
  s: number;
  v: number;
  a: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export type ColorFormat = "hex" | "rgb" | "hsl";

export type ChannelFormat = "rgb" | "hsl";

export type HexType = `#${string}`;
