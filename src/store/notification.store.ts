import { systemApi } from "@/api/system.api";
import { createPersistedStoreContext } from "@/lib/core/persisted.utils";
import { isRecord } from "@/lib/core/record.utils";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import { settingsAtoms } from "@/store/settings.store";
import { attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";
import type {
  DismissedEntry,
  NotificationAddOptions,
  NotificationItem,
  NotificationTarget,
  NotificationType,
} from "@/types/core/notification";

export const NOTIFICATION_SCHEMA_VERSION = 1;

const DEDUP_MS = 20_000;
const MAX_ITEMS = 100;
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSED = 200;
const NOTIFICATION_STORAGE_KEY = "notifications";

let nextNotificationId = 1;

function targetKey(target: NotificationItem["target"]): string {
  if (!target) return "";
  return target.source === "folder" ? `folder:${target.path}` : `anilist:${target.id}`;
}

function notificationSignature(
  type: NotificationType,
  title: string,
  message?: string,
  target?: NotificationItem["target"]
): string {
  return `${type}\u0000${title}\u0000${message ?? ""}\u0000${targetKey(target)}`;
}

function isNotificationItem(value: unknown): value is NotificationItem {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.timestamp === "number" &&
    typeof value.read === "boolean"
  );
}

function isDismissedEntry(value: unknown): value is DismissedEntry {
  return isRecord(value) && typeof value.signature === "string" && typeof value.at === "number";
}

function pruneDismissed(dismissed: DismissedEntry[], now: number): DismissedEntry[] {
  return dismissed.filter((entry) => now - entry.at < DISMISS_TTL_MS).slice(0, MAX_DISMISSED);
}

function unreadCountOf(items: NotificationItem[]): number {
  return items.filter((item) => !item.read && !item.popupOnly).length;
}

interface NotificationAtoms {
  items: Cell<NotificationItem[]>;
  dismissed: Cell<DismissedEntry[]>;
  unreadCount: Cell<number>;
}

export function resolveNotificationPersisted(
  persistedState: unknown,
  storageExists: boolean
): { items: NotificationItem[]; dismissed: DismissedEntry[] } | null {
  if (!storageExists) return null;
  if (!isRecord(persistedState)) return null;
  const items = Array.isArray(persistedState.items)
    ? persistedState.items
        .filter(isNotificationItem)
        .filter((item) => !item.progress && !item.popupOnly)
    : [];
  const dismissed = Array.isArray(persistedState.dismissed)
    ? pruneDismissed(persistedState.dismissed.filter(isDismissedEntry), Date.now())
    : [];
  return { items, dismissed };
}

function readLegacyNotifications(
  getStorage: () => Storage | undefined
): { data: { items: NotificationItem[]; dismissed: DismissedEntry[] }; maxId: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem(NOTIFICATION_STORAGE_KEY));
  if (readError !== null) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw ?? "null"));
  if (parseError !== null) return null;
  const envelope = isRecord(parsed) && "state" in parsed ? parsed.state : parsed;
  const resolved = resolveNotificationPersisted(envelope, raw !== null);
  if (!resolved) return null;
  const maxId = resolved.items.reduce((max, item) => Math.max(max, item.id), 0);
  return { data: { items: resolved.items, dismissed: resolved.dismissed }, maxId };
}

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

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => notifications.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") notifications.persistor.flush();
  });
}
