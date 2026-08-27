import { describe, expect, it } from "vitest";

import {
  USER_IMAGE_PREFIX,
  isUserImageIcon,
  userImageIcon,
  userImageId,
} from "@/lib/userimage.utils";

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
