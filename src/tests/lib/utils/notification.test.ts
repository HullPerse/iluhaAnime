import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  copyNotification,
  openNotificationTarget,
  showError,
  formatRelativeTime,
  resolveNotificationText,
} from "@/lib/utils/notification.utils";
import { useDeepLinkStore } from "@/store/deeplink.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

const writeTextSpy = vi.fn();
const openPathSpy = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (...args: unknown[]) => openPathSpy(...args),
}));

const addSpy = vi.spyOn(useNotificationStore.getState(), "add");

beforeEach(() => {
  useNotificationStore.setState({ items: [], unreadCount: 0 });
  addSpy.mockClear();
});

describe("notification helpers", () => {
  it("helpers add a real notification item to the store", () => {
    showError("Oops", "Details");
    const { items } = useNotificationStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("error");
    expect(items[0].title).toBe("Oops");
    expect(items[0].message).toBe("Details");
  });
});

describe("copyNotification", () => {
  const item = {
    id: 1,
    type: "error" as const,
    title: "Oops",
    message: "Something broke",
    timestamp: 1_700_000_000_000,
    read: false,
  };

  beforeEach(() => {
    writeTextSpy.mockReset();
  });

  it("copies type, title, message and local timestamp", async () => {
    await copyNotification(item);
    expect(writeTextSpy).toHaveBeenCalledWith(
      `[error] Oops\nSomething broke\n${new Date(item.timestamp).toLocaleString()}`
    );
  });

  it("omits the message line when absent", async () => {
    await copyNotification({ ...item, message: undefined });
    expect(writeTextSpy).toHaveBeenCalledWith(
      `[error] Oops\n${new Date(item.timestamp).toLocaleString()}`
    );
  });
});

describe("openNotificationTarget", () => {
  beforeEach(() => {
    openPathSpy.mockReset();
    openPathSpy.mockResolvedValue(undefined);
    useDeepLinkStore.setState({ target: null });
    useSettingsStore.setState({ anilistTabEnabled: true });
  });

  it("routes an anime target through the deep-link store", async () => {
    await expect(openNotificationTarget({ source: "anilist", id: 21 })).resolves.toBe("opened");
    expect(useDeepLinkStore.getState().target).toEqual({ source: "anilist", id: 21 });
    expect(openPathSpy).not.toHaveBeenCalled();
  });

  it("refuses an anime target when the anime tab is disabled", async () => {
    useSettingsStore.setState({ anilistTabEnabled: false });
    await expect(openNotificationTarget({ source: "anilist", id: 21 })).resolves.toBe(
      "tab-disabled"
    );
    expect(useDeepLinkStore.getState().target).toBeNull();
  });

  it("reveals the download folder for a folder target", async () => {
    await expect(
      openNotificationTarget({ source: "folder", path: "D:\\Anime\\Show" })
    ).resolves.toBe("opened");
    expect(openPathSpy).toHaveBeenCalledWith("D:\\Anime\\Show");
    expect(useDeepLinkStore.getState().target).toBeNull();
  });

  it("reports a failure when the folder cannot be opened", async () => {
    openPathSpy.mockRejectedValueOnce(new Error("no opener"));
    await expect(
      openNotificationTarget({ source: "folder", path: "D:\\Anime\\Show" })
    ).resolves.toBe("failed");
  });
});

describe("resolveNotificationText", () => {
  it("passes through plain title/body payloads", () => {
    expect(resolveNotificationText({ body: "World", title: "Hello" }, "en")).toEqual({
      body: "World",
      title: "Hello",
    });
  });

  it("falls back to empty strings when nothing is provided", () => {
    expect(resolveNotificationText({}, "en")).toEqual({ body: "", title: "" });
  });
});

describe("formatRelativeTime", () => {
  it("formats past timestamps with a suffix in both locales", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
      const twoHoursAgo = Date.now() - 2 * 3_600_000;
      expect(formatRelativeTime(twoHoursAgo, "en")).toBe("about 2 hours ago");
      expect(formatRelativeTime(twoHoursAgo, "ru")).toBe("около 2 часов назад");
    } finally {
      vi.useRealTimers();
    }
  });

  it("formats future timestamps with a forward suffix", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
      const inTwoHours = Date.now() + 2 * 3_600_000;
      expect(formatRelativeTime(inTwoHours, "en")).toBe("in about 2 hours");
      expect(formatRelativeTime(inTwoHours, "ru")).toBe("приблизительно через 2 часа");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("progress notifications", () => {
  beforeEach(() => {
    useNotificationStore.setState({ dismissed: [], items: [], unreadCount: 0 });
    window.localStorage.removeItem("notifications");
  });

  it("add returns the item id so callers can update it later", () => {
    const id = useNotificationStore
      .getState()
      .add("Deleting", "info", "Show", "evt-progress-1", { system: false });
    expect(id).toBeGreaterThan(0);
    expect(useNotificationStore.getState().items[0].id).toBe(id);
  });

  it("update patches one item without adding or bumping unread", () => {
    const id = useNotificationStore
      .getState()
      .add("Deleting", "info", "Show", undefined, { system: false });
    const unread = useNotificationStore.getState().unreadCount;
    useNotificationStore
      .getState()
      .update(id, { message: "Gone", progress: false, type: "success" });
    const { items, unreadCount } = useNotificationStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ message: "Gone", progress: false, type: "success" });
    expect(unreadCount).toBe(unread);
  });

  it("update ignores unknown ids", () => {
    useNotificationStore.getState().update(999_999, { type: "error" });
    expect(useNotificationStore.getState().items).toHaveLength(0);
  });

  it("rehydration drops in-progress items", () => {
    const now = Date.now();
    const progress = {
      id: 11,
      read: false,
      timestamp: now,
      title: "Deleting",
      type: "info" as const,
      progress: true,
    };
    const done = { id: 12, read: false, timestamp: now, title: "Gone", type: "success" as const };
    window.localStorage.setItem(
      "notifications",
      JSON.stringify({ state: { dismissed: [], items: [progress, done] }, version: 1 })
    );
    const merged = useNotificationStore.persist
      .getOptions()
      .merge?.({ dismissed: [], items: [progress, done] }, useNotificationStore.getState());
    expect(merged?.items.map((item) => item.id)).toEqual([12]);
  });
});
