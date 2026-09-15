import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "mocked-relative"),
}));

import {
  copyNotification,
  showError,
  formatRelativeTime,
  resolveNotificationText,
} from "@/lib/utils/notification.utils";
import { useNotificationStore } from "@/store/notification.store";

const writeTextSpy = vi.fn();

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
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
