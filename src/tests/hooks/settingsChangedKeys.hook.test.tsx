import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useChangedSettingsKeys } from "@/hooks/settingsChangedKeys.hook";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ animateTabSwitch: false, torrentCoverModeManual: false });
});

afterEach(() => {
  cleanup();
  patchSettings({ animateTabSwitch: false, torrentCoverModeManual: false });
});

describe("useChangedSettingsKeys", () => {
  it("tracks changed keys and ignores internal-only patches", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;

      return useChangedSettingsKeys();
    });

    expect(result.current.has("animateTabSwitch")).toBe(false);

    act(() => patchSettings({ animateTabSwitch: true }));
    expect(result.current.has("animateTabSwitch")).toBe(true);

    const settled = renders;
    act(() => patchSettings({ torrentCoverModeManual: true }));
    expect(renders).toBe(settled);

    act(() => patchSettings({ animateTabSwitch: false }));
    expect(result.current.has("animateTabSwitch")).toBe(false);
  });
});
