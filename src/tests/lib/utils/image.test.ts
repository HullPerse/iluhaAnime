import { describe, expect, it, vi } from "vitest";

import {
  USER_IMAGE_PREFIX,
  assetUrl,
  isUserImageIcon,
  toUserImage,
  userImageIcon,
  userImageId,
} from "@/lib/utils/image.utils";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

describe("user image icon helpers", () => {
  it("round-trips an asset id", () => {
    const icon = userImageIcon("abc123");
    expect(icon).toBe(`${USER_IMAGE_PREFIX}abc123`);
    expect(isUserImageIcon(icon)).toBe(true);
    expect(userImageId(icon)).toBe("abc123");
  });

  it("does not treat built-in icons or malformed values as user images", () => {
    expect(isUserImageIcon("w2k_globe.ico")).toBe(false);
    expect(userImageId("w2k_globe.ico")).toBeNull();
    expect(userImageId("user-image:")).toBeNull();
  });
});

describe("asset urls", () => {
  it("leaves a plain path untouched without a version", () => {
    expect(assetUrl("C:/images/aaa.png")).toBe(
      "http://asset.localhost/C%3A%2Fimages%2Faaa.png"
    );
    expect(assetUrl("C:/images/aaa.png", null)).toBe(assetUrl("C:/images/aaa.png"));
    expect(assetUrl("C:/images/aaa.png", "")).toBe(assetUrl("C:/images/aaa.png"));
  });

  it("appends the version so a rewritten file gets a new url", () => {
    const first = assetUrl("C:/images/aaa.png", "100");
    const second = assetUrl("C:/images/aaa.png", "200");
    expect(first).toBe("http://asset.localhost/C%3A%2Fimages%2Faaa.png?v=100");
    expect(second).not.toBe(first);
  });

  it("carries the version into the image url but not the original", () => {
    const image = toUserImage({
      id: "aaa",
      name: "art.png",
      mimeType: "image/png",
      path: "C:/images/aaa.png",
      originalPath: "C:/images/aaa.original.png",
      version: "42",
      createdAt: 10,
    });
    expect(image.url).toContain("?v=42");
    expect(image.originalUrl).not.toContain("v=");
    expect(image.version).toBe("42");
  });
});
