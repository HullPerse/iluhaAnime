import { describe, it, expect, beforeEach } from "vitest";
import { usePlayerStore } from "../player.store";

describe("usePlayerStore", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      volume: 1,
      folderPaths: [],
      settings: {
        rotation: 0,
        flipH: false,
        flipV: false,
        zoom: 1,
        aspectRatio: "contain",
        brightness: 100,
        contrast: 100,
        saturation: 100,
        hue: 0,
        blur: 0,
        sepia: 0,
        grayscale: 0,
        subFontSize: 18,
        subFontFamily: "Arial",
        subColor: "#ffffff",
        subBgOpacity: 0,
        subBgColor: "#000000",
      },
    });
  });

  it("starts with default state", () => {
    const state = usePlayerStore.getState();
    expect(state.folderPaths).toEqual([]);
    expect(state.settings.rotation).toBe(0);
    expect(state.settings.flipH).toBe(false);
  });

  it("setFolderPaths updates paths", () => {
    usePlayerStore.getState().setFolderPaths(["/path/to/videos"]);
    expect(usePlayerStore.getState().folderPaths).toEqual(["/path/to/videos"]);
  });

  it("setVolume updates volume", () => {
    usePlayerStore.getState().setVolume(0.5);
    expect(usePlayerStore.getState().volume).toBe(0.5);
  });

  it("patchSettings merges settings", () => {
    usePlayerStore.getState().patchSettings({ rotation: 90, flipH: true });
    const state = usePlayerStore.getState();
    expect(state.settings.rotation).toBe(90);
    expect(state.settings.flipH).toBe(true);
    expect(state.settings.aspectRatio).toBe("contain"); // unchanged
  });
});
