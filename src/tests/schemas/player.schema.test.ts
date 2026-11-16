import { describe, expect, it } from "vitest";
import {
  OpenRequestSchema,
  PlaybackEventSchema,
  PlaybackSnapshotSchema,
} from "@/schemas/player.schema";

describe("player event boundaries", () => {
  it("rejects malformed nested open requests and unknown event kinds", () => {
    expect(
      OpenRequestSchema.safeParse({ files: [], stream: { mediaUrl: "https://example.com" } })
        .success
    ).toBe(false);
    expect(OpenRequestSchema.safeParse({ files: ["a.mkv"], resume: "bad" }).success).toBe(false);
    expect(
      OpenRequestSchema.safeParse({ files: ["a.mkv"], watch: { kind: "folder", root: 1 } }).success
    ).toBe(false);
    expect(PlaybackEventSchema.safeParse({ kind: "run" }).success).toBe(false);
    expect(PlaybackEventSchema.safeParse({ kind: "end-file", reason: "stop" }).success).toBe(true);
  });

  it("requires a complete finite snapshot before it can reach the store", () => {
    const snapshot = {
      timePos: 3,
      duration: 10,
      pause: false,
      eofReached: false,
      speed: 1,
      volume: 50,
      muted: false,
      playlistIndex: 0,
      playlistCount: 1,
      path: "a.mkv",
    };
    expect(PlaybackSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(PlaybackSnapshotSchema.safeParse({ ...snapshot, timePos: Number.NaN }).success).toBe(
      false
    );
    expect(PlaybackSnapshotSchema.safeParse({ ...snapshot, duration: Infinity }).success).toBe(
      false
    );
    expect(PlaybackSnapshotSchema.safeParse({ path: "a.mkv" }).success).toBe(false);
  });
});
