import { describe, expect, it } from "vitest";

import { describeTorrentProblem } from "@/lib/core/problem.utils";

describe("torrent/problem", () => {
  it("reports missing files above the message", () => {
    expect(describeTorrentProblem("Permission denied", true)).toEqual({
      cause: "missing",
      headlineKey: "torrent.problem.missing",
    });
  });

  it("reports an unknown cause without a message", () => {
    expect(describeTorrentProblem(null, false)).toEqual({
      cause: "unknown",
      headlineKey: "torrent.problem.unknown",
    });
    expect(describeTorrentProblem("", false)).toEqual({
      cause: "unknown",
      headlineKey: "torrent.problem.unknown",
    });
  });

  it("maps OS failures to causes", () => {
    expect(describeTorrentProblem("Permission denied, opening ep01.mkv", false).cause).toBe(
      "noAccess"
    );
    expect(describeTorrentProblem("read-only file system", false).cause).toBe("readOnly");
    expect(describeTorrentProblem("no space left on device", false).cause).toBe("diskFull");
    expect(describeTorrentProblem("input/output error", false).cause).toBe("diskError");
  });

  it("maps network stalls to no peers", () => {
    expect(describeTorrentProblem("Timed out while resolving magnet metadata", false).cause).toBe(
      "noPeers"
    );
    expect(describeTorrentProblem("tracker unreachable", false).cause).toBe("noPeers");
  });

  it("falls back to other for unrecognized text", () => {
    expect(describeTorrentProblem("boom", false)).toEqual({
      cause: "other",
      headlineKey: "torrent.problem.other",
    });
  });

  it("does not mistake a stale torrent for missing files", () => {
    expect(describeTorrentProblem("torrent not found", false).cause).toBe("other");
    expect(describeTorrentProblem("file not found: ep01.mkv", false).cause).toBe("missing");
  });
});
