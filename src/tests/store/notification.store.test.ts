import { describe, it, expect, vi, beforeEach } from "vitest";

import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

const tauriNotifySpy = vi.fn();

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: (...args: unknown[]) => tauriNotifySpy(...args),
}));

beforeEach(() => {
  useNotificationStore.setState({ dismissed: [], items: [], unreadCount: 0 });
  useSettingsStore.setState({ notificationsEnabled: true });
  tauriNotifySpy.mockClear();
});

function getState() {
  return useNotificationStore.getState();
}

describe("useNotificationStore", () => {
  it("starts empty", () => {
    expect(getState().items).toEqual([]);
    expect(getState().unreadCount).toBe(0);
  });

  describe("add", () => {
    it("creates a notification item with required fields", () => {
      getState().add("Test title");
      const item = getState().items[0];
      expect(item).toMatchObject({
        read: false,
        title: "Test title",
        type: "info",
      });
      expect(item.id).toBeGreaterThan(0);
      expect(item.timestamp).toBeGreaterThan(0);
    });

    it("creates a notification with custom type and message", () => {
      getState().add("Error!", "error", "Something went wrong");
      const item = getState().items[0];
      expect(item.title).toBe("Error!");
      expect(item.type).toBe("error");
      expect(item.message).toBe("Something went wrong");
    });

    it("increments unreadCount", () => {
      getState().add("One");
      expect(getState().unreadCount).toBe(1);
      getState().add("Two");
      expect(getState().unreadCount).toBe(2);
    });

    it("prepends new items to the top", () => {
      getState().add("First");
      getState().add("Second");
      expect(getState().items[0].title).toBe("Second");
      expect(getState().items[1].title).toBe("First");
    });

    it("caps at 100 items", () => {
      for (let i = 0; i < 101; i++) {
        getState().add(`Item ${i + 1}`);
      }
      expect(getState().items.length).toBe(100);
      expect(getState().items[99].title).toBe("Item 2");
    });

    it("calls tauri sendNotification", () => {
      getState().add("Test", "success", "Details");
      expect(tauriNotifySpy).toHaveBeenCalledWith({
        body: "Details",
        title: "Test",
      });
    });

    it("skips the native toast when notifications are disabled in settings", () => {
      useSettingsStore.setState({ notificationsEnabled: false });
      getState().add("Quiet", "info", "Still recorded in the tray");
      expect(tauriNotifySpy).not.toHaveBeenCalled();
      expect(getState().items).toHaveLength(1);
      expect(getState().unreadCount).toBe(1);
    });
  });

  describe("dedup", () => {
    it("collapses identical notifications within the dedup window", () => {
      getState().add("Error", "error", "Same message");
      getState().add("Error", "error", "Same message");
      expect(getState().items).toHaveLength(1);
      expect(getState().unreadCount).toBe(1);
      expect(tauriNotifySpy).toHaveBeenCalledTimes(1);
    });

    it("keeps notifications with different messages separate", () => {
      getState().add("Error", "error", "First");
      getState().add("Error", "error", "Second");
      expect(getState().items).toHaveLength(2);
      expect(getState().unreadCount).toBe(2);
      expect(tauriNotifySpy).toHaveBeenCalledTimes(2);
    });

    it("does not dedup different types", () => {
      getState().add("Same title", "error", "Body");
      getState().add("Same title", "warning", "Body");
      expect(getState().items).toHaveLength(2);
    });

    it("re-surfaces a repeated notification that was already read", () => {
      getState().add("Error", "error", "Recurring");
      const { id } = getState().items[0];
      getState().markRead(id);
      expect(getState().unreadCount).toBe(0);

      getState().add("Error", "error", "Recurring");
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].read).toBe(false);
      expect(getState().unreadCount).toBe(1);
      expect(tauriNotifySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("markRead", () => {
    it("marks a single item as read and updates count", () => {
      getState().add("A");
      getState().add("B");
      const { id } = getState().items[0];

      getState().markRead(id);

      expect(getState().items.find((i) => i.id === id)?.read).toBe(true);
      expect(getState().unreadCount).toBe(1);
    });

    it("does nothing if id does not exist", () => {
      getState().add("A");
      getState().markRead(99_999);
      expect(getState().unreadCount).toBe(1);
    });
  });

  describe("markAllRead", () => {
    it("marks all items as read", () => {
      getState().add("A");
      getState().add("B");
      getState().add("C");
      getState().markAllRead();

      expect(getState().items.every((i) => i.read)).toBe(true);
      expect(getState().unreadCount).toBe(0);
    });
  });

  describe("clear", () => {
    it("removes an item and recalculates unreadCount", () => {
      getState().add("A");
      getState().add("B");
      getState().add("C");
      const { id } = getState().items[0];

      getState().clear(id);

      expect(getState().items).toHaveLength(2);
      expect(getState().items.find((i) => i.id === id)).toBeUndefined();
      expect(getState().unreadCount).toBe(2);
    });
  });

  describe("clearAll", () => {
    it("removes all items, resets count, and suppresses replayed events", () => {
      getState().add("A");
      getState().add("B");
      getState().clearAll();

      expect(getState().items).toEqual([]);
      expect(getState().unreadCount).toBe(0);

      getState().add("A");
      expect(getState().items).toEqual([]);
    });
  });

  describe("dismissal suppression", () => {
    it("does not re-add a dismissed notification with the same content", () => {
      getState().add("Ошибка загрузки", "error", "Torrent A: disk full");
      getState().clear(getState().items[0].id);
      expect(getState().items).toHaveLength(0);

      getState().add("Ошибка загрузки", "error", "Torrent A: disk full");
      expect(getState().items).toHaveLength(0);
      expect(getState().unreadCount).toBe(0);
      expect(tauriNotifySpy).toHaveBeenCalledTimes(1);
    });

    it("still adds a notification with different content after a dismissal", () => {
      getState().add("Ошибка загрузки", "error", "Torrent A: disk full");
      getState().clear(getState().items[0].id);

      getState().add("Ошибка загрузки", "error", "Torrent A: tracker timeout");
      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].message).toBe("Torrent A: tracker timeout");
    });

    it("does not suppress a notification with the same title but a different type", () => {
      getState().add("Same", "error", "Body");
      getState().clear(getState().items[0].id);

      getState().add("Same", "success", "Body");
      expect(getState().items).toHaveLength(1);
    });

    it("clearAll suppresses the exact events that were cleared", () => {
      getState().add("A");
      getState().clearAll();
      getState().add("A");
      expect(getState().items).toHaveLength(0);
    });

    it("does not duplicate a persisted item when a keyed backend event replays", () => {
      getState().add(
        "Загрузка завершена",
        "success",
        "Anime",
        "torrent-complete:1:abc"
      );
      const { id } = getState().items[0];
      getState().markRead(id);

      getState().add(
        "Загрузка завершена",
        "success",
        "Anime",
        "torrent-complete:1:abc"
      );

      expect(getState().items).toHaveLength(1);
      expect(getState().items[0].read).toBe(true);
      expect(getState().unreadCount).toBe(0);
    });

    it("suppresses a keyed event after clear all", () => {
      getState().add(
        "Загрузка завершена",
        "success",
        "Anime",
        "torrent-complete:1:abc"
      );
      getState().clearAll();

      getState().add(
        "Загрузка завершена",
        "success",
        "Anime",
        "torrent-complete:1:abc"
      );
      expect(getState().items).toHaveLength(0);
    });

    it("re-allows the same notification after the suppression window", () => {
      vi.useFakeTimers();
      try {
        getState().add("Ошибка загрузки", "error", "old failure");
        getState().clear(getState().items[0].id);
        vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
        getState().add("Ошибка загрузки", "error", "old failure");
        expect(getState().items).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("mixed operations", () => {
    it("maintains correct unreadCount through mixed operations", () => {
      getState().add("A");
      getState().add("B");
      getState().add("C");
      expect(getState().unreadCount).toBe(3);

      const second = getState().items[1];
      getState().markRead(second.id);
      expect(getState().unreadCount).toBe(2);

      getState().clear(second.id);
      expect(getState().unreadCount).toBe(2);

      getState().markAllRead();
      expect(getState().unreadCount).toBe(0);
    });
  });
});
