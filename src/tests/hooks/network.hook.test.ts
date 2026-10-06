import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { isOfflineDisabledTab, markOfflineTabs, useOnlineStatus } from "@/hooks/network.hook";
import type { TabId } from "@/types/settings";

const ONLINE = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

afterEach(() => {
  if (ONLINE) Object.defineProperty(window.navigator, "onLine", ONLINE);
});

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

describe("useOnlineStatus", () => {
  it("reports online when the browser is online", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("reports offline when the browser starts offline", () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("flips on window online and offline events", () => {
    setOnLine(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
    unmount();
  });
});

describe("isOfflineDisabledTab", () => {
  it("flags anilist and search only", () => {
    expect(isOfflineDisabledTab("anilist")).toBe(true);
    expect(isOfflineDisabledTab("search")).toBe(true);
    expect(isOfflineDisabledTab("torrent")).toBe(false);
    expect(isOfflineDisabledTab("player")).toBe(false);
    expect(isOfflineDisabledTab("collection")).toBe(false);
    expect(isOfflineDisabledTab("settings")).toBe(false);
  });
});

describe("markOfflineTabs", () => {
  const tabs = [
    { id: "search", label: "Search" },
    { id: "torrent", label: "Torrent" },
    { id: "anilist", label: "AniList" },
  ] as const;

  it("keeps every tab enabled while online", () => {
    const marked = markOfflineTabs(tabs, true);
    expect(marked.every((tab) => tab.disabled === false)).toBe(true);
    expect(marked.map((tab) => tab.id as TabId)).toEqual(["search", "torrent", "anilist"]);
  });

  it("disables only anilist and search while offline", () => {
    const marked = markOfflineTabs(tabs, false);
    expect(marked.find((tab) => tab.id === "search")?.disabled).toBe(true);
    expect(marked.find((tab) => tab.id === "anilist")?.disabled).toBe(true);
    expect(marked.find((tab) => tab.id === "torrent")?.disabled).toBe(false);
  });
});
