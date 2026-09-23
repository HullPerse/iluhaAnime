import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "mocked-relative"),
}));

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
  it("delegates to date-fns with the timestamp and locale", () => {
    expect(formatRelativeTime(1_700_000_000_000, "en")).toBe("mocked-relative");
    expect(formatDistanceToNow).toHaveBeenCalledWith(1_700_000_000_000, {
      addSuffix: true,
      locale: enUS,
    });
  });
});
