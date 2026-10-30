import { describe, expect, it } from "vitest";

import { requiredBytesForSelection } from "@/store/download.store";

const files = [
  { index: 0, name: "Show/Episode 01.mkv", size: 100 },
  { index: 1, name: "Show/Episode 02.mkv", size: 200 },
];

describe("requiredBytesForSelection", () => {
  it("sums only the selected payloads", () => {
    expect(requiredBytesForSelection({ files, conflictingFiles: [] }, [1])).toBe(200);
  });

  it("reserves both copies of a selected file that already exists", () => {
    expect(
      requiredBytesForSelection({ files, conflictingFiles: ["Show/Episode 01.mkv"] }, [0, 1])
    ).toBe(100 + 100 + 200);
  });

  it("does not reserve an unselected conflicting file", () => {
    expect(
      requiredBytesForSelection({ files, conflictingFiles: ["Show/Episode 01.mkv"] }, [1])
    ).toBe(200);
  });

  it("ignores indices that are not in the file list", () => {
    expect(requiredBytesForSelection({ files, conflictingFiles: [] }, [99])).toBe(0);
  });
});
