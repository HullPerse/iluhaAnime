import { describe, it, expect } from "vitest";

import { formatBytes } from "@/lib/utils/bytes.utils";

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats KB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats MB with one decimal", () => {
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  it("formats GB with two decimals instead of capping at MB", () => {
    expect(formatBytes(1_073_741_824)).toBe("1.00 GB");
    expect(formatBytes(1_610_612_736)).toBe("1.50 GB");
    expect(formatBytes(2_147_483_648)).toBe("2.00 GB");
  });
});
