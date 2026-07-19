import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNotificationStore } from "../notification.store";

const tauriNotifySpy = vi.fn();

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: (...args: unknown[]) => tauriNotifySpy(...args),
}));

beforeEach(() => {
  useNotificationStore.setState({ items: [], unreadCount: 0 });
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
        title: "Test title",
        type: "info",
        read: false,
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
        title: "Test",
        body: "Details",
      });
    });
  });

  describe("markRead", () => {
    it("marks a single item as read and updates count", () => {
      getState().add("A");
      getState().add("B");
      const id = getState().items[0].id;

      getState().markRead(id);

      expect(getState().items.find((i) => i.id === id)?.read).toBe(true);
      expect(getState().unreadCount).toBe(1);
    });

    it("does nothing if id does not exist", () => {
      getState().add("A");
      getState().markRead(99999);
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
      const id = getState().items[0].id;

      getState().clear(id);

      expect(getState().items).toHaveLength(2);
      expect(getState().items.find((i) => i.id === id)).toBeUndefined();
      expect(getState().unreadCount).toBe(2);
    });
  });

  describe("clearAll", () => {
    it("removes all items and resets count", () => {
      getState().add("A");
      getState().add("B");
      getState().clearAll();

      expect(getState().items).toEqual([]);
      expect(getState().unreadCount).toBe(0);
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
