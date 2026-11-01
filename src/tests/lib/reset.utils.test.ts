import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { isDefaultSetting } from "@/lib/core/reset.utils";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({
    vimMode: DEFAULT_SETTINGS.vimMode,
    torrentCoverMode: DEFAULT_SETTINGS.torrentCoverMode,
    torrentCoverModeManual: DEFAULT_SETTINGS.torrentCoverModeManual,
  });
});

describe("isDefaultSetting", () => {
  it("is true while the value equals its default", () => {
    expect(isDefaultSetting("vimMode")).toBe(true);
  });

  it("is false after a change and true again after a restore", () => {
    patchSettings({ vimMode: true });
    expect(isDefaultSetting("vimMode")).toBe(false);
    patchSettings({ vimMode: DEFAULT_SETTINGS.vimMode });
    expect(isDefaultSetting("vimMode")).toBe(true);
  });

  it("checks every field of a grouped reset", () => {
    expect(isDefaultSetting(["torrentCoverMode", "torrentCoverModeManual"])).toBe(true);
    patchSettings({ torrentCoverModeManual: true });
    expect(isDefaultSetting(["torrentCoverMode", "torrentCoverModeManual"])).toBe(false);
  });
});
