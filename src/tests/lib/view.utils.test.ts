import { describe, expect, it } from "vitest";

import { resolveViewChrome } from "@/lib/core/view.utils";
import type { ViewChromeInput } from "@/types/core/view";

function input(overrides: Partial<ViewChromeInput> = {}): ViewChromeInput {
  return {
    mode: "normal",
    cinema: false,
    fullscreen: false,
    autoHide: false,
    barsVisible: true,
    menuOpen: false,
    ...overrides,
  };
}

describe("resolveViewChrome", () => {
  it("keeps the plain windowed layout in normal without cinema or fullscreen", () => {
    expect(resolveViewChrome(input())).toEqual({
      fullBleed: false,
      showHeader: true,
      bottom: "full",
      barsAutoHide: false,
      barsHidden: false,
    });
  });

  it("never hides layout bars in normal, whatever autoHide says", () => {
    for (const barsVisible of [true, false]) {
      const chrome = resolveViewChrome(input({ autoHide: true, barsVisible }));
      expect(chrome.fullBleed).toBe(false);
      expect(chrome.barsHidden).toBe(false);
    }
  });

  it("turns cinema into overlay bars that hide only under autoHide", () => {
    const visible = resolveViewChrome(input({ cinema: true }));
    expect(visible).toEqual({
      fullBleed: true,
      showHeader: true,
      bottom: "full",
      barsAutoHide: false,
      barsHidden: false,
    });
    expect(resolveViewChrome(input({ cinema: true, autoHide: true, barsVisible: false }))).toEqual({
      fullBleed: true,
      showHeader: true,
      bottom: "full",
      barsAutoHide: true,
      barsHidden: true,
    });
  });

  it("keeps overlay bars while the context menu is open", () => {
    const chrome = resolveViewChrome(
      input({ cinema: true, autoHide: true, barsVisible: false, menuOpen: true })
    );
    expect(chrome.barsHidden).toBe(false);
  });

  it("treats fullscreen like cinema in normal", () => {
    expect(
      resolveViewChrome(input({ fullscreen: true, autoHide: true, barsVisible: false }))
    ).toEqual({
      fullBleed: true,
      showHeader: true,
      bottom: "full",
      barsAutoHide: true,
      barsHidden: true,
    });
  });

  it("gives compact the slim bar over a full-bleed video, always visible", () => {
    expect(resolveViewChrome(input({ mode: "compact" }))).toEqual({
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: false,
      barsHidden: false,
    });
    expect(
      resolveViewChrome(input({ mode: "compact", autoHide: true, barsVisible: false }))
    ).toEqual({
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: false,
      barsHidden: false,
    });
  });

  it("ignores cinema outside the normal preset", () => {
    for (const mode of ["minimal", "compact"] as const) {
      expect(resolveViewChrome(input({ mode, cinema: true }))).toEqual(
        resolveViewChrome(input({ mode }))
      );
    }
  });

  it("keeps the slim bar in minimal but lets auto-hide take it away", () => {
    expect(resolveViewChrome(input({ mode: "minimal" }))).toEqual({
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: true,
      barsHidden: false,
    });
    expect(resolveViewChrome(input({ mode: "minimal", barsVisible: false }))).toEqual({
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: true,
      barsHidden: true,
    });
    expect(
      resolveViewChrome(input({ mode: "minimal", barsVisible: false, menuOpen: true }))
    ).toEqual({
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: true,
      barsHidden: false,
    });
  });
});
