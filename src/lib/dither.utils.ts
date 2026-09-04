const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function ditherPixel(luma: number, x: number, y: number, noise: number): number {
  const threshold = (BAYER_4X4[y % 4][x % 4] / 16) * 255;
  const jitter = (Math.random() - 0.5) * noise * 255;
  const adjusted = luma + jitter;
  return adjusted > threshold ? 255 : 0;
}

export function applyOrderedDither(imageData: ImageData, noiseStrength = 0.08): void {
  const { data, width, height } = imageData;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const out = ditherPixel(luma, x, y, noiseStrength);
      data[idx] = out;
      data[idx + 1] = out;
      data[idx + 2] = out;
    }
  }
}

export function getBayerMatrix(): readonly (readonly number[])[] {
  return BAYER_4X4;
}
