import { describe, expect, it } from "vitest";

import {
  buildTorrentPlaybackPlan,
  isStreamTarget,
  isVideoFileName,
  mediaKeyForTarget,
  playableTorrentIndices,
  sourceForTarget,
  streamTokens,
  targetForMediaKey,
  torrentPlaybackTargets,
} from "@/lib/player/stream.utils";
import type { TorrentFileInfo, TorrentStream } from "@/types/torrent";
import type { PlayerSource } from "@/types/videoPlayer";

function file(index: number, name: string, patch: Partial<TorrentFileInfo> = {}): TorrentFileInfo {
  return {
    index,
    name,
    size: 100,
    progress_bytes: 0,
    completed: false,
    selected: false,
    priority: "normal",
    exists: false,
    ...patch,
  };
}

function stream(index: number, path: string, target?: string): TorrentStream {
  return {
    token: target ? "token" : null,
    url: target ?? null,
    target: target ?? path,
    path,
    localPath: target ? null : path,
    name: path.split("/").pop() ?? path,
    size: 100,
    fileIndex: index,
    streaming: Boolean(target),
  };
}

describe("stream targets", () => {
  it("recognises loopback and remote urls", () => {
    expect(isStreamTarget("http://127.0.0.1:9/s/token/a.mkv")).toBe(true);
    expect(isStreamTarget("HTTPS://example.test/a.mkv")).toBe(true);
    expect(isStreamTarget("C:/T/a.mkv")).toBe(false);
  });

  it("maps playlist targets to stable media keys", () => {
    const sources: PlayerSource[] = [
      { target: "http://127.0.0.1:9/s/t/a.mkv", path: "C:/T/A.mkv", streaming: true },
      { target: "C:/T/b.mkv", path: "C:/T/b.mkv" },
    ];
    expect(sourceForTarget(sources, "http://127.0.0.1:9/s/t/a.mkv")?.path).toBe("C:/T/A.mkv");
    expect(mediaKeyForTarget(sources, "http://127.0.0.1:9/s/t/a.mkv")).toBe("C:/T/A.mkv");
    expect(mediaKeyForTarget(sources, "C:/T/unknown.mkv")).toBe("C:/T/unknown.mkv");
    expect(targetForMediaKey(sources, "c:\\t\\b.mkv")).toBe("C:/T/b.mkv");
    expect(targetForMediaKey(sources, "C:/T/unknown.mkv")).toBe("C:/T/unknown.mkv");
  });

  it("collects only tokens of live streams", () => {
    const sources: PlayerSource[] = [
      { target: "http://a/1", path: "C:/1", streaming: true, token: "one" },
      { target: "C:/2", path: "C:/2" },
      { target: "http://a/3", path: "C:/3", streaming: true },
    ];
    expect(streamTokens(sources)).toEqual(["one"]);
    expect(streamTokens(undefined)).toEqual([]);
  });

  it("matches video extensions on the file name only", () => {
    expect(isVideoFileName("Season 02/Show - 01.MKV", ["mkv", "mp4"])).toBe(true);
    expect(isVideoFileName("Show - 01.srt", ["mkv", "mp4"])).toBe(false);
    expect(isVideoFileName("Show - 01", ["mkv"])).toBe(false);
  });
});

describe("playableTorrentIndices", () => {
  const files = [
    file(0, "Show - 01.mkv", { completed: true, exists: true, selected: true }),
    file(1, "Show - 02.mkv", { selected: true }),
    file(2, "Show - 03.mkv"),
    file(3, "Show - 04.mkv", { completed: true, exists: false, selected: true }),
    file(4, "Show - 05.srt"),
  ];

  it("takes finished files and selected downloads", () => {
    expect(playableTorrentIndices(files, -1, new Set(["srt"]))).toEqual([0, 1]);
  });

  it("adds the explicitly clicked file even when it was deselected", () => {
    expect(playableTorrentIndices(files, 2, new Set(["srt"]))).toEqual([0, 1, 2]);
  });

  it("skips sidecar tracks and empty payloads", () => {
    expect(playableTorrentIndices([file(9, "a.srt", { size: 10 })], -1, new Set(["srt"]))).toEqual([]);
    expect(playableTorrentIndices([file(9, "a.mkv", { size: 0 })], 9)).toEqual([]);
  });
});

describe("buildTorrentPlaybackPlan", () => {
  it("orders by stable path and starts at the clicked episode", () => {
    const plan = buildTorrentPlaybackPlan(
      [
        stream(1, "C:/T/Show - 10.mkv", "http://127.0.0.1:9/s/a/Show%20-%2010.mkv"),
        stream(0, "C:/T/Show - 02.mkv"),
      ],
      "C:/T/Show - 10.mkv"
    );

    expect(plan?.files).toEqual(["C:/T/Show - 02.mkv", "http://127.0.0.1:9/s/a/Show%20-%2010.mkv"]);
    expect(plan?.startIndex).toBe(1);
    expect(plan?.sources[1]).toMatchObject({
      target: "http://127.0.0.1:9/s/a/Show%20-%2010.mkv",
      path: "C:/T/Show - 10.mkv",
      streaming: true,
      token: "token",
      fileIndex: 1,
    });
  });

  it("appends extras in path order and deduplicates targets", () => {
    const plan = buildTorrentPlaybackPlan(
      [stream(0, "C:/T/Show - 02.mkv")],
      "C:/T/Show - 02.mkv",
      ["C:/T/Show - 01.mkv", "C:/T/Show - 02.mkv"]
    );

    expect(plan?.files).toEqual(["C:/T/Show - 01.mkv", "C:/T/Show - 02.mkv"]);
    expect(plan?.sources[0].streaming).toBe(false);
    expect(plan?.startIndex).toBe(1);
  });

  it("returns null when the clicked file is not part of the plan", () => {
    expect(
      buildTorrentPlaybackPlan([stream(0, "C:/T/a.mkv")], "C:/T/missing.mkv")
    ).toBeNull();
    expect(buildTorrentPlaybackPlan([], "C:/T/a.mkv")).toBeNull();
  });
});

describe("torrentPlaybackTargets", () => {
  it("keeps the prepared order and adds extras by path", () => {
    const sources: PlayerSource[] = [
      { target: "http://127.0.0.1:9/s/a/2.mkv", path: "C:/T/2.mkv", streaming: true },
      { target: "C:/T/4.mkv", path: "C:/T/4.mkv" },
    ];
    expect(torrentPlaybackTargets(sources, ["C:/T/3.mkv", "C:/T/4.mkv"])).toEqual([
      "http://127.0.0.1:9/s/a/2.mkv",
      "C:/T/3.mkv",
      "C:/T/4.mkv",
    ]);
  });

  it("handles an empty set", () => {
    expect(torrentPlaybackTargets([], [])).toEqual([]);
    expect(torrentPlaybackTargets([], ["", "  "])).toEqual([]);
  });
});
