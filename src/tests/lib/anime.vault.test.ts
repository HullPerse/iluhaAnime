import { describe, expect, it } from "vitest";

import {
  buildOrganizationPreview,
  buildVaultEpisodeMatrix,
  buildVaultHealthReport,
  parseVaultFilename,
} from "@/lib/anime.vault";

describe("anime vault analysis", () => {
  it("parses common season and episode labels", () => {
    expect(
      parseVaultFilename("Frieren - S01E04 - 1080p HEVC.mkv")
    ).toMatchObject({
      codec: "hevc",
      episode: 4,
      quality: "1080p",
      season: 1,
      title: "Frieren",
    });
  });

  it("reports missing episodes and duplicate candidates", () => {
    const report = buildVaultHealthReport([
      { name: "A S01E01.mkv", path: "A S01E01.mkv", size: 100 },
      { name: "A S01E01 alt.mkv", path: "A S01E01 alt.mkv", size: 80 },
      { name: "A S01E03.mkv", path: "A S01E03.mkv", size: 90 },
    ]);
    expect(report.issues.some((issue) => issue.kind === "duplicate")).toBe(
      true
    );
    expect(report.issues.some((issue) => issue.kind === "missing")).toBe(true);
    expect(report.reclaimableBytes).toBeGreaterThan(0);
  });

  it("chooses a best local release and keeps duplicate counts in the episode matrix", () => {
    const report = buildVaultHealthReport([
      { name: "A S01E01 720p.mkv", path: "A S01E01 720p.mkv", size: 80 },
      {
        name: "A S01E01 1080p HEVC.mkv",
        path: "A S01E01 1080p HEVC.mkv",
        size: 120,
      },
    ]);
    const matrix = buildVaultEpisodeMatrix(report.files);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]?.bestRelease.quality).toBe("1080p");
    expect(matrix[0]?.duplicateCount).toBe(1);
  });

  it("matches sidecar subtitles by the same season and episode identity", () => {
    const report = buildVaultHealthReport([
      { name: "A S01E01.mkv", path: "A S01E01.mkv", size: 100 },
      { name: "A S01E01.eng.srt", path: "A S01E01.eng.srt", size: 2 },
    ]);

    expect(report.files[0]?.subtitleLikely).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "subtitle")).toBe(
      false
    );
  });

  it("creates a preview without mutating source paths", () => {
    const report = buildVaultHealthReport([
      {
        name: "Bocchi S01E02.mkv",
        path: "C:/Downloads/Bocchi S01E02.mkv",
        size: 100,
      },
    ]);
    const preview = buildOrganizationPreview(report.files, "C:/Media");
    expect(preview[0]?.sourcePath).toBe("C:/Downloads/Bocchi S01E02.mkv");
    expect(preview[0]?.targetPath).toContain(
      "Anime/Bocchi/Season 01/S01E02.mkv"
    );
    expect(preview[0]?.action).toBe("move");
  });
});
