import { describe, expect, it, vi, beforeEach } from "vitest";

import { joinMediaPath, openFileInPlayer } from "@/lib/utils/media.utils";

const openPathSpy = vi.fn();
const showErrorSpy = vi.fn();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (...args: unknown[]) => openPathSpy(...args),
}));

vi.mock("@/lib/utils/notification.utils", () => ({
  showError: (...args: unknown[]) => showErrorSpy(...args),
}));

vi.mock("@/store/settings.store", () => ({
  useSettingsStore: { getState: () => ({ language: "en" }) },
}));

beforeEach(() => {
  openPathSpy.mockReset();
  showErrorSpy.mockReset();
});

describe("joinMediaPath", () => {
  it("joins base and relative paths", () => {
    expect(joinMediaPath("C:\\Anime\\", "Season 1\\episode.mkv")).toBe(
      "C:\\Anime/Season 1\\episode.mkv"
    );
  });

  it("strips trailing separators from the base path", () => {
    expect(joinMediaPath("C:\\Anime\\", "ep.mkv")).toBe("C:\\Anime/ep.mkv");
    expect(joinMediaPath("/downloads/", "ep.mkv")).toBe("/downloads/ep.mkv");
  });

  it("strips leading separators from the relative path", () => {
    expect(joinMediaPath("C:\\Anime", "\\Season 1\\ep.mkv")).toBe("C:\\Anime/Season 1\\ep.mkv");
    expect(joinMediaPath("C:\\Anime", "/Season 1/ep.mkv")).toBe("C:\\Anime/Season 1/ep.mkv");
  });
});

describe("openFileInPlayer", () => {
  it("normalizes forward slashes and opens the path", async () => {
    await openFileInPlayer("C:/Anime/ep1.mkv");
    expect(openPathSpy).toHaveBeenCalledWith("C:\\Anime\\ep1.mkv");
  });

  it("keeps backslash paths as-is", async () => {
    await openFileInPlayer("C:\\Anime\\ep1.mkv");
    expect(openPathSpy).toHaveBeenCalledWith("C:\\Anime\\ep1.mkv");
  });

  it("surfaces opener failures via notification instead of throwing", async () => {
    openPathSpy.mockRejectedValueOnce(new Error("no opener"));
    await expect(openFileInPlayer("ep.mkv")).resolves.toBeUndefined();
    expect(showErrorSpy).toHaveBeenCalledWith(expect.any(String), "Error: no opener");
  });
});
