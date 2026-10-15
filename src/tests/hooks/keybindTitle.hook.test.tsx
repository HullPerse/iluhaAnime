import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useKeybindChord, useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { patchSettings } from "@/store/settings.store";

describe("useKeybindTitle", () => {
  afterEach(() => {
    patchSettings({ keybindOverrides: {} });
  });

  it("prefixes the default chord", () => {
    const { result, unmount } = renderHook(() => useKeybindTitle("Pause", "torrent.pause.resume"));
    expect(result.current).toBe("[P]: Pause");
    unmount();
  });

  it("follows rebinds and drops the prefix when unbound", () => {
    patchSettings({ keybindOverrides: { "torrent.pause.resume": "KeyX" } });
    const { result, rerender, unmount } = renderHook(() =>
      useKeybindTitle("Pause", "torrent.pause.resume")
    );
    expect(result.current).toBe("[X]: Pause");

    patchSettings({ keybindOverrides: { "torrent.pause.resume": null } });
    rerender();
    expect(result.current).toBe("Pause");
    unmount();
  });
});

describe("useKeybindChord", () => {
  afterEach(() => {
    patchSettings({ keybindOverrides: {} });
  });

  it("returns the humanized chord and null when unbound", () => {
    const { result, unmount } = renderHook(() => useKeybindChord("page.find"));
    expect(result.current).toBe("Ctrl+F");
    unmount();

    patchSettings({ keybindOverrides: { "page.find": null } });
    const rebound = renderHook(() => useKeybindChord("page.find"));
    expect(rebound.result.current).toBeNull();
    rebound.unmount();
  });
});
