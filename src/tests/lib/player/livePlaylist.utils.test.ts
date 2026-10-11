import { describe, expect, it } from "vitest";

import { desiredFolderPlaylist, planLiveInserts } from "@/lib/player/livePlaylist.utils";

describe("planLiveInserts", () => {
  it("inserts a late download before its sorted successor", () => {
    const ops = planLiveInserts(
      ["C:/T/ep01.mkv", "C:/T/ep02.mkv", "C:/T/ep03.mkv"],
      ["C:/T/ep02.mkv", "C:/T/ep03.mkv"],
      "C:/T/ep02.mkv"
    );
    expect(ops).toEqual([{ path: "C:/T/ep01.mkv", index: 0 }]);
  });

  it("places a batch from one tick in sorted order", () => {
    const ops = planLiveInserts(
      ["C:/T/ep01.mkv", "C:/T/ep02.mkv", "C:/T/ep03.mkv", "C:/T/ep04.mkv"],
      ["C:/T/ep02.mkv"],
      "C:/T/ep02.mkv"
    );
    expect(ops).toEqual([
      { path: "C:/T/ep01.mkv", index: 0 },
      { path: "C:/T/ep03.mkv", index: 2 },
      { path: "C:/T/ep04.mkv", index: 3 },
    ]);
  });

  it("anchors after the predecessor when the user reordered the live list", () => {
    const ops = planLiveInserts(
      ["C:/T/ep01.mkv", "C:/T/ep02.mkv", "C:/T/ep03.mkv"],
      ["C:/T/ep03.mkv", "C:/T/ep01.mkv"],
      "C:/T/ep01.mkv"
    );
    expect(ops).toEqual([{ path: "C:/T/ep02.mkv", index: 2 }]);
  });

  it("keeps the newcomer next to its sorted neighbor past foreign entries", () => {
    const ops = planLiveInserts(
      ["C:/T/ep01.mkv", "C:/T/ep09.mkv"],
      ["C:/T/ep01.mkv", "C:/T/other.mkv"],
      "C:/T/ep01.mkv"
    );
    expect(ops).toEqual([{ path: "C:/T/ep09.mkv", index: 1 }]);
  });

  it("returns no ops when everything is already present", () => {
    expect(planLiveInserts(["C:/T/ep01.mkv"], ["C:/T/ep01.mkv"], "C:/T/ep01.mkv")).toEqual([]);
  });

  it("returns no ops when the anchor left the live list", () => {
    expect(
      planLiveInserts(["C:/T/ep01.mkv", "C:/T/ep02.mkv"], ["C:/T/ep03.mkv"], "C:/T/ep01.mkv")
    ).toEqual([]);
  });

  it("appends at the end when neither neighbor is present", () => {
    const ops = planLiveInserts(
      ["C:/T/ep01.mkv", "C:/T/ep09.mkv"],
      ["C:/T/other.mkv"],
      "C:/T/other.mkv"
    );
    expect(ops).toEqual([
      { path: "C:/T/ep01.mkv", index: 1 },
      { path: "C:/T/ep09.mkv", index: 2 },
    ]);
  });

  it("matches paths across separator styles", () => {
    expect(planLiveInserts(["C:/T/ep01.mkv"], ["C:\\T\\ep01.mkv"], "C:/T/ep01.mkv")).toEqual([]);
  });
});

describe("desiredFolderPlaylist", () => {
  const entries = [
    { name: "ep02.mkv", path: "C:\\V\\Show\\ep02.mkv", size: 10 },
    { name: "ep01.mkv", path: "C:\\V\\Show\\ep01.mkv", size: 10 },
  ];

  it("returns the sorted containing folder of the anchor", () => {
    expect(desiredFolderPlaylist(entries, "C:\\V", "C:\\V\\Show\\ep02.mkv")).toEqual([
      "C:\\V\\Show\\ep01.mkv",
      "C:\\V\\Show\\ep02.mkv",
    ]);
  });

  it("returns null when the anchor folder is gone", () => {
    expect(desiredFolderPlaylist(entries, "C:\\V", "C:\\V\\Other\\ep01.mkv")).toBeNull();
  });
});
