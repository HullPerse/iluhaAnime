import { describe, it, expect, vi, beforeAll } from "vitest";

const storage = new Map<string, string>();

let useNotificationStore: (typeof import("@/store/notification.store"))["useNotificationStore"];

beforeAll(async () => {
  vi.stubGlobal("window", {
    localStorage: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const mod = await import("@/store/notification.store");
  useNotificationStore = mod.useNotificationStore;
});

describe("notification store persistence", () => {
  it("writes new items to localStorage", () => {
    useNotificationStore.getState().add("Hello", "success", "World");
    const raw = storage.get("notifications");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: { items: unknown[] } };
    expect(parsed.state.items).toHaveLength(1);
  });

  it("rehydrates persisted items with correct unread count", async () => {
    storage.set(
      "notifications",
      JSON.stringify({
        state: {
          items: [
            {
              id: 1,
              read: false,
              timestamp: 123,
              title: "Old unread",
              type: "info",
            },
            {
              id: 2,
              read: true,
              timestamp: 456,
              title: "Old read",
              type: "success",
            },
          ],
        },
        version: 1,
      })
    );
    await useNotificationStore.persist.rehydrate();

    const { items } = useNotificationStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Old unread");
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("keeps new notification ids unique after rehydration", () => {
    useNotificationStore.getState().add("Fresh");
    const fresh = useNotificationStore.getState().items[0];
    expect(fresh.id).toBe(3);
  });

  it("does not restore cleared notifications after a restart-style rehydration", async () => {
    useNotificationStore.getState().add("Should be deleted");
    expect(storage.get("notifications")).toBeTruthy();

    useNotificationStore.getState().clearAll();

    expect(useNotificationStore.getState().items).toEqual([]);
    const clearedSnapshot = storage.get("notifications");
    expect(clearedSnapshot).toBeTruthy();
    expect(JSON.parse(clearedSnapshot!).state.items).toEqual([]);

    await useNotificationStore.persist.rehydrate();

    expect(useNotificationStore.getState().items).toEqual([]);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
