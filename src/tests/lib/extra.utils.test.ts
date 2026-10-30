import { describe, expect, it } from "vitest";

import { isExtraFile } from "@/lib/extra.utils";

describe("isExtraFile", () => {
  it("matches upscaled and converted outputs", () => {
    expect(isExtraFile("D:/T/Show_upscaled.mkv")).toBe(true);
    expect(isExtraFile("D:/T/Show_converted.mp4")).toBe(true);
  });

  it("does not match the original files", () => {
    expect(isExtraFile("D:/T/Show.mkv")).toBe(false);
    expect(isExtraFile("D:/T/Show.part")).toBe(false);
  });

  it("handles backslashes and case", () => {
    expect(isExtraFile("D:\\T\\Show_UPSCALED.MKV")).toBe(true);
  });
});
