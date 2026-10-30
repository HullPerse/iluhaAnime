import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockOpenPath, mockOpenUrl } from "@/tests/mocks";
import NotificationToasts from "@/components/shared/notification/toasts.notification";
import { addNotification, notificationAtoms, updateNotification } from "@/store/notification.store";
import { patchSettings } from "@/store/settings.store";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: mockOpenPath,
  openUrl: mockOpenUrl,
}));

beforeEach(() => {
  vi.useFakeTimers();
  mockOpenPath.mockReset();
  mockOpenPath.mockResolvedValue(undefined);
  patchSettings({ language: "en", notificationPopups: "inapp" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const addInfo = (title = "Hello", message = "World"): number => {
  let id = -1;
  act(() => {
    id = addNotification(title, "info", message);
  });
  return id;
};

describe("NotificationToasts", () => {
  it("shows a new notification and hides it after the default duration, keeping it unread", () => {
    render(<NotificationToasts />);
    addInfo();
    expect(screen.getByText("Hello")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Hello")).toBeNull();
    expect(notificationAtoms.items.get()).toHaveLength(1);
    expect(notificationAtoms.unreadCount.get()).toBe(1);
  });

  it("ignores notifications that existed before mount", () => {
    addInfo();
    const view = render(<NotificationToasts />);
    expect(view.queryByText("Hello")).toBeNull();
  });

  it("drops the toast when the item turns into a progress notification", () => {
    render(<NotificationToasts />);
    const id = addInfo();
    expect(screen.getByText("Hello")).toBeTruthy();
    act(() => {
      updateNotification(id, { progress: true });
    });
    expect(screen.queryByText("Hello")).toBeNull();
    expect(notificationAtoms.items.get()).toHaveLength(1);
  });

  it("marks the notification read when the user closes the toast", () => {
    render(<NotificationToasts />);
    addInfo();
    fireEvent.click(screen.getByLabelText("Dismiss notification"));
    expect(screen.queryByText("Hello")).toBeNull();
    expect(notificationAtoms.items.get()).toHaveLength(1);
    expect(notificationAtoms.items.get()[0].read).toBe(true);
    expect(notificationAtoms.unreadCount.get()).toBe(0);
  });

  it("opens a folder target on body click and marks the notification read", () => {
    render(<NotificationToasts />);
    let id = -1;
    act(() => {
      id = addNotification("Folder", "success", "Done", undefined, {
        target: { source: "folder", path: "D:\\Anime" },
      });
    });
    expect(id).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Folder"));
    expect(mockOpenPath).toHaveBeenCalledWith("D:\\Anime");
    expect(screen.queryByText("Folder")).toBeNull();
    expect(notificationAtoms.items.get()[0].read).toBe(true);
  });

  it.each(["off", "system"] as const)("shows nothing when popups are %s", (mode) => {
    patchSettings({ notificationPopups: mode });
    const view = render(<NotificationToasts />);
    addInfo();
    expect(view.queryByText("Hello")).toBeNull();
    expect(notificationAtoms.items.get()).toHaveLength(1);
  });

  it.each(["inapp", "both"] as const)("shows toasts when popups are %s", (mode) => {
    patchSettings({ notificationPopups: mode });
    render(<NotificationToasts />);
    addInfo();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("pauses the countdown while hovered", () => {
    render(<NotificationToasts />);
    addInfo();
    const toast = screen.getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Hello" }).getAttribute("aria-valuenow")).toBe(
      "8000"
    );
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("hides the toast within one tick of the bar reaching zero", () => {
    render(<NotificationToasts />);
    addInfo();
    act(() => {
      vi.advanceTimersByTime(7900);
    });
    expect(screen.getByText("Hello")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("shrinks the countdown strip with the remaining time", () => {
    render(<NotificationToasts />);
    addInfo();
    const countdown = screen.getByRole("progressbar", { name: "Hello" });
    expect(countdown.getAttribute("aria-valuenow")).toBe("8000");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(countdown.getAttribute("aria-valuenow")).toBe("4000");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("exposes a single keyboard stop per toast", () => {
    const view = render(<NotificationToasts />);
    addInfo();
    expect(view.container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("opens the target on keyboard Enter", () => {
    render(<NotificationToasts />);
    let id = -1;
    act(() => {
      id = addNotification("Folder", "success", "Done", undefined, {
        target: { source: "folder", path: "D:\\Anime" },
      });
    });
    expect(id).toBeGreaterThan(0);
    fireEvent.keyDown(screen.getByRole("button", { name: "Open anime details" }), {
      key: "Enter",
    });
    expect(mockOpenPath).toHaveBeenCalledWith("D:\\Anime");
    expect(screen.queryByText("Folder")).toBeNull();
    expect(notificationAtoms.items.get()[0].read).toBe(true);
  });

  it("caps the visible stack and keeps every item in the tray", () => {
    render(<NotificationToasts />);
    act(() => {
      for (let i = 0; i < 6; i += 1) addNotification(`Toast ${i}`, "info", "Body");
    });
    expect(screen.getAllByRole("status")).toHaveLength(4);
    expect(notificationAtoms.items.get()).toHaveLength(6);
  });
});
