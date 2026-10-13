import { describe, expect, it } from "vitest";

import { movePlaylistFocus } from "@/lib/player/playlistFocus.utils";

describe("player/playlist focus", () => {
  it("starts the ring on the playing row", () => {
    expect(movePlaylistFocus(null, 3, 10, 1)).toBe(4);
    expect(movePlaylistFocus(null, 3, 10, -1)).toBe(2);
  });

  it("starts on the first row when nothing is playing", () => {
    expect(movePlaylistFocus(null, -1, 10, 1)).toBe(1);
    expect(movePlaylistFocus(null, -1, 10, -1)).toBe(0);
  });

  it("moves from the current focus, not the playing row", () => {
    expect(movePlaylistFocus(7, 1, 10, 1)).toBe(8);
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(movePlaylistFocus(0, 0, 10, -1)).toBe(0);
    expect(movePlaylistFocus(9, 0, 10, 1)).toBe(9);
  });

  it("pulls a focus left past the end back into range", () => {
    expect(movePlaylistFocus(12, 0, 4, -1)).toBe(3);
    expect(movePlaylistFocus(12, 0, 4, 1)).toBe(3);
  });

  it("has no ring for an empty playlist", () => {
    expect(movePlaylistFocus(null, -1, 0, 1)).toBeNull();
    expect(movePlaylistFocus(2, 0, 0, 1)).toBeNull();
  });
});
