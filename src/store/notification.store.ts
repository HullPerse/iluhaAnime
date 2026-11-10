import { systemApi } from "@/api/system.api";
import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { createPersistedStoreContext } from "@/lib/core/persistence/persisted.utils";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import { settingsAtoms } from "@/store/settings.store";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import {
  isDismissedEntry,
  isNotificationItem,
  NOTIFICATION_STORAGE_KEY,
  notificationSignature,
  pruneDismissed,
  readLegacyNotifications,
  resolveNotificationPersisted,
  targetKey,
  unreadCountOf,
} from "@/store/notification/notification.persistence";

export { resolveNotificationPersisted };
import type {
  DismissedEntry,
  NotificationAddOptions,
  NotificationItem,
  NotificationTarget,
  NotificationType,
} from "@/types/core/notification";

export const NOTIFICATION_SCHEMA_VERSION = SCHEMA_VERSIONS.notifications;

const DEDUP_MS = 20_000;
const MAX_ITEMS = 100;

interface NotificationAtoms {
  items: Cell<NotificationItem[]>;
  dismissed: Cell<DismissedEntry[]>;
  unreadCount: Cell<number>;
}

let nextNotificationId = 1;

interface NotificationSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

interface NotificationSignalStore {
  atoms: NotificationAtoms;
  persistor: Persistor;
  add: (
    title: string,
    type?: NotificationType,
    message?: string,
    eventKey?: string,
    options?: NotificationAddOptions
  ) => number;
  update: (
    id: number,
    patch: Partial<Pick<NotificationItem, "title" | "message" | "type" | "progress">>,
    options?: { system?: boolean }
  ) => void;
  clear: (id: number) => void;
  clearAll: () => void;
  markAllRead: () => void;
  markRead: (id: number) => void;
}

export function createNotificationSignalStore(
  options: NotificationSignalOptions = {}
): NotificationSignalStore {
  let restoredMaxId = 0;
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "notifications",
    short: "notification",
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => {
      const migrated = readLegacyNotifications(get);
      if (!migrated) return null;
      restoredMaxId = migrated.maxId;
      return { data: migrated.data, schemaVersion: NOTIFICATION_SCHEMA_VERSION };
    },
  });

  const persisted = persistor.read();
  const persistedData = persisted ? persisted.data : {};
  const persistedItems = Array.isArray(persistedData.items)
    ? persistedData.items
        .filter(isNotificationItem)
        .filter((item) => !item.progress && !item.popupOnly)
    : [];
  const persistedDismissed = Array.isArray(persistedData.dismissed)
    ? persistedData.dismissed.filter(isDismissedEntry)
    : [];
  if (persisted) {
    restoredMaxId = persistedItems.reduce((max, item) => Math.max(max, item.id), 0);
  }
  const mirror: Record<string, unknown> = { items: persistedItems, dismissed: persistedDismissed };
  const rawItems = store.atom("items", persistedItems);
  const rawDismissed = store.atom("dismissed", persistedDismissed);
  const unreadCount = store.atom("unreadCount", unreadCountOf(persistedItems));
  // Every mutation has to go through these wrappers: the mirror is what the
  // persist subscriber serializes, so a raw atom write would silently skip
  // saving the change (notifications would disappear after a restart).
  const items: Cell<NotificationItem[]> = {
    id: rawItems.id,
    get: rawItems.get,
    set: (value: NotificationItem[]) => {
      rawItems.set(value);
      mirror.items = value;
    },
    update: (fn: (value: NotificationItem[]) => NotificationItem[]) => {
      const next = fn(rawItems.get());
      rawItems.set(next);
      mirror.items = next;
    },
    subscribe: rawItems.subscribe,
  };
  const dismissed: Cell<DismissedEntry[]> = {
    id: rawDismissed.id,
    get: rawDismissed.get,
    set: (value: DismissedEntry[]) => {
      rawDismissed.set(value);
      mirror.dismissed = value;
    },
    update: (fn: (value: DismissedEntry[]) => DismissedEntry[]) => {
      const next = fn(rawDismissed.get());
      rawDismissed.set(next);
      mirror.dismissed = next;
    },
    subscribe: rawDismissed.subscribe,
  };
  const atoms: NotificationAtoms = {
    items,
    dismissed,
    unreadCount,
  };

  store.subscribeAll(() => {
    const items = Array.isArray(mirror.items)
      ? mirror.items.filter(
          (item): item is NotificationItem => isNotificationItem(item) && !item.popupOnly
        )
      : [];
    persistor.write({ items, dismissed: mirror.dismissed });
  });

  nextNotificationId = Math.max(nextNotificationId, restoredMaxId + 1);

  const showToast = (
    title: string,
    message: string | null,
    target: NotificationTarget | null | undefined,
    system: boolean | undefined
  ): void => {
    if (!(system ?? true)) return;
    const mode = settingsAtoms.notificationPopups.get();
    if (mode !== "system" && mode !== "both") return;
    systemApi
      .showToast(title, message, target ?? null)
      .catch((error) => reportBackgroundError("notification.system-toast", error));
  };

  const handle: NotificationSignalStore = {
    atoms,
    persistor,
    add: (title, type = "info", message?, eventKey?, options?) => {
      const now = Date.now();
      const target = options?.target;
      const signature = notificationSignature(type, title, message, target);
      const prunedDismissed = pruneDismissed(dismissed.get(), now);
      if (
        prunedDismissed.some(
          (entry) => (eventKey && entry.eventKey === eventKey) || entry.signature === signature
        )
      ) {
        return -1;
      }

      const current = items.get();
      const existing = current.find(
        (item) =>
          (eventKey && item.eventKey === eventKey) ||
          (item.title === title &&
            item.message === message &&
            item.type === type &&
            targetKey(item.target) === targetKey(target) &&
            (Boolean(eventKey) || now - item.timestamp < DEDUP_MS))
      );
      if (existing) {
        if (eventKey) return existing.id;
        let unreadDelta = 0;
        items.set(
          current.map((item) => {
            if (item.id !== existing.id) return item;
            unreadDelta = item.read ? 1 : 0;
            return { ...item, timestamp: now, read: false };
          })
        );
        unreadCount.set(unreadCount.get() + unreadDelta);
        return existing.id;
      }

      const id = nextNotificationId++;
      const item: NotificationItem = {
        id,
        type,
        title,
        message,
        ...(eventKey ? { eventKey } : {}),
        ...(target ? { target } : {}),
        ...(options?.silent ? { silent: true } : {}),
        ...(options?.popupOnly ? { popupOnly: true } : {}),
        timestamp: now,
        read: false,
      };
      items.set([item, ...current].slice(0, MAX_ITEMS));
      if (!options?.popupOnly) unreadCount.set(unreadCount.get() + 1);
      if (!options?.silent) showToast(title, message ?? null, target ?? null, options?.system);
      return id;
    },
    update: (id, patch, options) => {
      const current = items.get();
      if (!current.some((item) => item.id === id)) return;
      items.set(
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.message !== undefined ? { message: patch.message } : {}),
                ...(patch.type !== undefined ? { type: patch.type } : {}),
                ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
                timestamp: Date.now(),
              }
            : item
        )
      );
      if (options?.system === true) {
        const updated = items.get().find((item) => item.id === id);
        if (!updated) return;
        showToast(updated.title, updated.message ?? null, updated.target ?? null, true);
      }
    },
    clear: (id) => {
      const current = items.get();
      const removed = current.find((i) => i.id === id);
      const next = current.filter((i) => i.id !== id);
      const nextDismissed = removed
        ? pruneDismissed(
            [
              {
                signature: notificationSignature(
                  removed.type,
                  removed.title,
                  removed.message,
                  removed.target
                ),
                ...(removed.eventKey ? { eventKey: removed.eventKey } : {}),
                at: Date.now(),
              },
              ...dismissed.get(),
            ],
            Date.now()
          )
        : dismissed.get();
      items.set(next);
      dismissed.set(nextDismissed);
      unreadCount.set(unreadCountOf(next));
    },
    clearAll: () => {
      const now = Date.now();
      const current = items.get();
      const nextDismissed = pruneDismissed(
        current.reduce<DismissedEntry[]>(
          (entries, item) => [
            {
              signature: notificationSignature(item.type, item.title, item.message, item.target),
              ...(item.eventKey ? { eventKey: item.eventKey } : {}),
              at: now,
            },
            ...entries,
          ],
          dismissed.get()
        ),
        now
      );
      items.set([]);
      dismissed.set(nextDismissed);
      unreadCount.set(0);
    },
    markAllRead: () => {
      items.set(items.get().map((i) => ({ ...i, read: true })));
      unreadCount.set(0);
    },
    markRead: (id) => {
      const next = items.get().map((i) => (i.id === id ? { ...i, read: true } : i));
      items.set(next);
      unreadCount.set(unreadCountOf(next));
    },
  };

  finishAdopt(() => ({ items: mirror.items, dismissed: mirror.dismissed }), {
    remove: NOTIFICATION_STORAGE_KEY,
  });

  return handle;
}

const notifications = createNotificationSignalStore();

export const notificationAtoms = notifications.atoms;
export const addNotification = notifications.add;
export const updateNotification = notifications.update;
export const clearNotification = notifications.clear;
export const clearAllNotifications = notifications.clearAll;
export const markAllNotificationsRead = notifications.markAllRead;
export const markNotificationRead = notifications.markRead;

export function resetNotificationAtoms(): void {
  notificationAtoms.items.set([]);
  notificationAtoms.dismissed.set([]);
  notificationAtoms.unreadCount.set(0);
  nextNotificationId = 1;
}
