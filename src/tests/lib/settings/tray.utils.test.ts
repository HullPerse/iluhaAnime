import { describe, expect, it } from "vitest";

import { buildTrayMenuEntries, shouldHideOnClose } from "@/lib/settings/tray.utils";

describe("shouldHideOnClose", () => {
  it("hides the window when minimize to tray is on and quit was not requested", () => {
    expect(shouldHideOnClose(true, false)).toBe(true);
  });

  it("closes the app after the tray quit item allowed quitting", () => {
    expect(shouldHideOnClose(true, true)).toBe(false);
  });

  it("closes the app when minimize to tray is off", () => {
    expect(shouldHideOnClose(false, false)).toBe(false);
    expect(shouldHideOnClose(false, true)).toBe(false);
  });
});

describe("buildTrayMenuEntries", () => {
  it("lists every visible tab before the separator and the quit item", () => {
    const entries = buildTrayMenuEntries(
      [
        { id: "search", label: "Search" },
        { id: "settings", label: "Settings" },
      ],
      "Quit"
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["tab", "tab", "separator", "quit"]);
    expect(entries[0]).toMatchObject({ id: "tray-tab-search", text: "Search" });
    expect(entries[2]).toMatchObject({ id: "tray-separator" });
    expect(entries[3]).toMatchObject({ id: "tray-quit", text: "Quit" });
  });

  it("omits disabled tabs instead of rendering them", () => {
    const entries = buildTrayMenuEntries([{ id: "torrent", label: "Torrents" }], "Quit");
    expect(entries).toHaveLength(3);
    expect(entries.some((entry) => entry.id === "tray-tab-search")).toBe(false);
  });

  it("still offers quit when every tab is disabled", () => {
    const entries = buildTrayMenuEntries([], "Quit");
    expect(entries.map((entry) => entry.kind)).toEqual(["separator", "quit"]);
  });
});
