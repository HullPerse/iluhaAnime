import { systemApi } from "@/api/system.api";
import { createPersistor, persistKey, type Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { settingsAtoms } from "@/store/settings.store";
import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type {
  DismissedEntry,
  NotificationAddOptions,
  NotificationItem,
  NotificationTarget,
  NotificationType,
} from "@/types/notification";

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

function pruneDismissed(dismissed: DismissedEntry[], now: number): DismissedEntry[] {
  return dismissed.filter((entry) => now - entry.at < DISMISS_TTL_MS).slice(0, MAX_DISMISSED);
}

export interface NotificationData {
  items: NotificationItem[];
  dismissed: DismissedEntry[];
  unreadCount: number;
}

export interface NotificationAtoms {
  items: Cell<NotificationItem[]>;
  dismissed: Cell<DismissedEntry[]>;
  unreadCount: Cell<number>;
}

export function resolveNotificationPersisted(
  persistedState: unknown,
  storageExists: boolean
): { items: NotificationItem[]; dismissed: DismissedEntry[] } | null {
  if (!storageExists) return null;
  if (!persistedState || typeof persistedState !== "object") return null;
  const persisted = persistedState as { items?: unknown; dismissed?: unknown };
  const items = Array.isArray(persisted.items)
    ? (persisted.items as NotificationItem[]).filter((item) => !item.progress)
    : [];
  const dismissed = Array.isArray(persisted.dismissed)
    ? pruneDismissed(persisted.dismissed as DismissedEntry[], Date.now())
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
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw ?? "null") as unknown);
  if (parseError !== null) return null;
  const envelope = (
    parsed && typeof parsed === "object" && "state" in parsed
      ? (parsed as { state: unknown }).state
      : parsed
  ) as { items?: unknown; dismissed?: unknown } | null;
  const resolved = resolveNotificationPersisted(envelope, raw !== null);
  if (!resolved) return null;
  const maxId = resolved.items.reduce((max, item) => Math.max(max, item.id), 0);
  return { data: { items: resolved.items, dismissed: resolved.dismissed }, maxId };
}

function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export interface NotificationSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface NotificationSignalStore {
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
  const getStorage = options.getStorage ?? defaultGetStorage;
  const store = createSignalStore();
  let adoptedFromLegacy = false;
  let restoredMaxId = 0;
  const persistor = createPersistor({
    storeName: "notifications",
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    getStorage,
    debounceMs: options.debounceMs,
    fallback: () => {
      const migrated = readLegacyNotifications(getStorage);
      if (!migrated) return null;
      adoptedFromLegacy = true;
      restoredMaxId = migrated.maxId;
      return { data: migrated.data, schemaVersion: NOTIFICATION_SCHEMA_VERSION };
    },
    onError: (scope, error) =>
      reportBackgroundError(`notification.signal.${scope}`, error as Error),
  });

  const persisted = persistor.read();
  const persistedData = (
    persisted ? (persisted.data as { items?: unknown; dismissed?: unknown }) : {}
  ) as { items?: unknown; dismissed?: unknown };
  const persistedItems = Array.isArray(persistedData.items)
    ? (persistedData.items as NotificationItem[])
    : [];
  const persistedDismissed = Array.isArray(persistedData.dismissed)
    ? (persistedData.dismissed as DismissedEntry[])
    : [];
  if (persisted) {
    restoredMaxId = persistedItems.reduce((max, item) => Math.max(max, item.id), 0);
  }
  const mirror: Record<string, unknown> = { items: persistedItems, dismissed: persistedDismissed };
  const items = store.atom("items", persistedItems);
  const dismissed = store.atom("dismissed", persistedDismissed);
  const unreadCount = store.atom(
    "unreadCount",
    persistedItems.filter((item) => !item.read).length
  );
  const wrapItems = {
    id: items.id,
    get: items.get,
    set: (value: NotificationItem[]) => {
      items.set(value);
      mirror.items = value;
    },
    update: items.update,
    subscribe: items.subscribe,
  };
  const wrapDismissed = {
    id: dismissed.id,
    get: dismissed.get,
    set: (value: DismissedEntry[]) => {
      dismissed.set(value);
      mirror.dismissed = value;
    },
    update: dismissed.update,
    subscribe: dismissed.subscribe,
  };
  const atoms: NotificationAtoms = {
    items: wrapItems,
    dismissed: wrapDismissed,
    unreadCount,
  };

  store.subscribeAll(() => {
    persistor.write({ items: mirror.items, dismissed: mirror.dismissed });
  });

  nextNotificationId = Math.max(nextNotificationId, restoredMaxId + 1);

  const showToast = (
    title: string,
    message: string | null,
    target: NotificationTarget | null | undefined,
    system: boolean | undefined
  ): void => {
    if ((system ?? true) && settingsAtoms.notificationsEnabled.get()) {
      systemApi
        .showToast(title, message, target ?? null)
        .catch((error) => reportBackgroundError("notification.system-toast", error));
    }
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
        timestamp: now,
        read: false,
      };
      items.set([item, ...current].slice(0, MAX_ITEMS));
      unreadCount.set(unreadCount.get() + 1);
      showToast(title, message ?? null, target ?? null, options?.system);
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
      unreadCount.set(next.filter((i) => !i.read).length);
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
      unreadCount.set(next.filter((i) => !i.read).length);
    },
  };

  if (adoptedFromLegacy) {
    persistor.write({ items: mirror.items, dismissed: mirror.dismissed });
    persistor.flush();
    const [storage, storageError] = attemptSync(() => getStorage());
    if (storageError !== null) reportBackgroundError("notification.signal.adopt", storageError);
    else {
      const [adopted, adoptError] = attemptSync(() =>
        storage?.getItem(persistKey("notifications"))
      );
      if (adoptError !== null) reportBackgroundError("notification.signal.adopt", adoptError);
      else if (adopted) {
        const [, removeError] = attemptSync(() =>
          storage?.removeItem(NOTIFICATION_STORAGE_KEY)
        );
        if (removeError !== null) reportBackgroundError("notification.signal.adopt", removeError);
      }
    }
  }

  return handle;
}

const notifications = createNotificationSignalStore();

export const notificationAtoms = notifications.atoms;
export const notificationPersistor = notifications.persistor;
export const addNotification = notifications.add;
export const updateNotification = notifications.update;
export const clearNotification = notifications.clear;
export const clearAllNotifications = notifications.clearAll;
export const markAllNotificationsRead = notifications.markAllRead;
export const markNotificationRead = notifications.markRead;

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
