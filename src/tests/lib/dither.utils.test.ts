import { describe, expect, it } from "vitest";

import { applyOrderedDither } from "@/lib/dither.utils";

describe("ordered dithering", () => {
  it("produces black and white output", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = i * 16;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const imageData = { data, width, height } as ImageData;
    applyOrderedDither(imageData, 0);
    for (let i = 0; i < width * height; i++) {
      const v = data[i * 4];
      expect([0, 255]).toContain(v);
      expect(data[i * 4 + 1]).toBe(v);
      expect(data[i * 4 + 2]).toBe(v);
    }
  });

  it("exposes bayer matrix", async () => {
    const { getBayerMatrix } = await import("@/lib/dither.utils");
    const m = getBayerMatrix();
    expect(m.length).toBe(4);
    expect(m[0].length).toBe(4);
  });
});
