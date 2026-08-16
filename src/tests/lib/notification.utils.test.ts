import { describe, it, expect, vi, beforeEach } from "vitest";

import { translate } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import {
  copyNotification,
  showError,
  showWarning,
  showSuccess,
  showInfo,
  formatRelativeTime,
  resolveNotificationText,
} from "@/lib/notification.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { TranslationVariables } from "@/types";

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
  it("showError calls store add with type error", () => {
    showError("Test Error", "Something broke");
    expect(addSpy).toHaveBeenCalledWith(
      "Test Error",
      "error",
      "Something broke"
    );
  });

  it("showWarning calls store add with type warning", () => {
    showWarning("Heads up", "Careful");
    expect(addSpy).toHaveBeenCalledWith("Heads up", "warning", "Careful");
  });

  it("showSuccess calls store add with type success", () => {
    showSuccess("Done", "Finished");
    expect(addSpy).toHaveBeenCalledWith("Done", "success", "Finished");
  });

  it("showInfo calls store add with type info", () => {
    showInfo("FYI", "Details");
    expect(addSpy).toHaveBeenCalledWith("FYI", "info", "Details");
  });

  it("helpers add a real notification item to the store", () => {
    showError("Oops", "Details");
    const { items } = useNotificationStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("error");
    expect(items[0].title).toBe("Oops");
    expect(items[0].message).toBe("Details");
  });
});

const t = (key: TranslationKey, vars?: TranslationVariables) =>
  translate("en", key, vars);

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
    expect(
      resolveNotificationText({ body: "World", title: "Hello" }, "en")
    ).toEqual({
      body: "World",
      title: "Hello",
    });
  });

  it("falls back to empty strings when nothing is provided", () => {
    expect(resolveNotificationText({}, "en")).toEqual({ body: "", title: "" });
  });
});

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000;

  it("returns 'just now' for less than a minute", () => {
    expect(formatRelativeTime(now - 5000, t, now)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime(now - 5 * 60_000, t, now)).toBe("5 min ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime(now - 2 * 3_600_000, t, now)).toBe("2 h ago");
  });

  it("formats days", () => {
    expect(formatRelativeTime(now - 3 * 86_400_000, t, now)).toBe("3 d ago");
  });

  it("clamps future timestamps to 'just now'", () => {
    expect(formatRelativeTime(now + 60_000, t, now)).toBe("just now");
  });
});
