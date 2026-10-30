import { describe, expect, it } from "vitest";

import { resolveChapterJump } from "@/lib/chapter.utils";

const CHAPTERS = [{ time: 0 }, { time: 60 }, { time: 120 }];

describe("resolveChapterJump", () => {
  it("jumps to the neighboring chapter when one exists", () => {
    expect(
      resolveChapterJump({
        chapters: CHAPTERS,
        timePos: 90,
        duration: 180,
        hasPrev: true,
        hasNext: true,
        direction: -1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 0 });
    expect(
      resolveChapterJump({
        chapters: CHAPTERS,
        timePos: 90,
        duration: 180,
        hasPrev: true,
        hasNext: true,
        direction: 1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 120 });
  });

  it("jumps to the first chapter when positioned before it", () => {
    expect(
      resolveChapterJump({
        chapters: [{ time: 30 }, { time: 60 }],
        timePos: 10,
        duration: 180,
        hasPrev: true,
        hasNext: true,
        direction: 1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 30 });
  });

  it("falls back to a plain step inside the edge chapter with a neighbor file", () => {
    expect(
      resolveChapterJump({
        chapters: CHAPTERS,
        timePos: 30,
        duration: 180,
        hasPrev: true,
        hasNext: true,
        direction: -1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 25 });
    expect(
      resolveChapterJump({
        chapters: CHAPTERS,
        timePos: 150,
        duration: 180,
        hasPrev: true,
        hasNext: true,
        direction: 1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 155 });
  });

  it("reports the boundary with nowhere to go", () => {
    expect(
      resolveChapterJump({
        chapters: CHAPTERS,
        timePos: 30,
        duration: 180,
        hasPrev: false,
        hasNext: true,
        direction: -1,
        step: 5,
      })
    ).toEqual({ kind: "boundary", edge: "first" });
    expect(
      resolveChapterJump({
        chapters: CHAPTERS,
        timePos: 150,
        duration: 180,
        hasPrev: true,
        hasNext: false,
        direction: 1,
        step: 5,
      })
    ).toEqual({ kind: "boundary", edge: "last" });
  });

  it("steps plainly without chapters and clamps to the file edges", () => {
    expect(
      resolveChapterJump({
        chapters: [],
        timePos: 3,
        duration: 180,
        hasPrev: false,
        hasNext: false,
        direction: -1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 0 });
    expect(
      resolveChapterJump({
        chapters: [],
        timePos: 178,
        duration: 180,
        hasPrev: false,
        hasNext: false,
        direction: 1,
        step: 5,
      })
    ).toEqual({ kind: "seek", time: 180 });
  });
});
