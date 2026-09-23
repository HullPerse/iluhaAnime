import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  DismissedEntry,
  NotificationAddOptions,
  NotificationItem,
  NotificationStore,
  NotificationTarget,
  NotificationType,
} from "@/types/notification";

const DEDUP_MS = 20_000;
const MAX_ITEMS = 100;
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSED = 200;
const NOTIFICATION_STORAGE_KEY = "notifications";
const notificationStorage = createJSONStorage(() => window.localStorage);

let nextId = 1;

function targetKey(target?: NotificationTarget): string {
  if (!target) return "";
  return target.source === "folder" ? `folder:${target.path}` : `anilist:${target.id}`;
}

function notificationSignature(
  type: NotificationType,
  title: string,
  message?: string,
  target?: NotificationTarget
): string {
  return `${type}\u0000${title}\u0000${message ?? ""}\u0000${targetKey(target)}`;
}

function pruneDismissed(dismissed: DismissedEntry[], now: number): DismissedEntry[] {
  return dismissed.filter((entry) => now - entry.at < DISMISS_TTL_MS).slice(0, MAX_DISMISSED);
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      add: (
        title: string,
        type: NotificationType = "info",
        message?: string,
        eventKey?: string,
        options?: NotificationAddOptions
      ) => {
        const now = Date.now();
        const target = options?.target;

        const signature = notificationSignature(type, title, message, target);
        const dismissed = pruneDismissed(get().dismissed, now);
        if (
          dismissed.some(
            (entry) => (eventKey && entry.eventKey === eventKey) || entry.signature === signature
          )
        ) {
          return;
        }

        const existing = get().items.find(
          (item) =>
            (eventKey && item.eventKey === eventKey) ||
            (item.title === title &&
              item.message === message &&
              item.type === type &&
              targetKey(item.target) === targetKey(target) &&
              (Boolean(eventKey) || now - item.timestamp < DEDUP_MS))
        );
        if (existing) {
          if (eventKey) return;

          set((s) => {
            let unreadDelta = 0;
            const items = s.items.map((item) => {
              if (item.id !== existing.id) return item;
              unreadDelta = item.read ? 1 : 0;
              return { ...item, timestamp: now, read: false };
            });
            return { items, unreadCount: s.unreadCount + unreadDelta };
          });
          return;
        }

        const item: NotificationItem = {
          id: nextId++,
          type,
          title,
          message,
          ...(eventKey ? { eventKey } : {}),
          ...(target ? { target } : {}),
          timestamp: now,
          read: false,
        };

        set((s) => ({
          items: [item, ...s.items].slice(0, MAX_ITEMS),
          unreadCount: s.unreadCount + 1,
        }));

        if ((options?.system ?? true) && useSettingsStore.getState().notificationsEnabled) {
          invokeTyped("show_toast", {
            action: target ?? null,
            body: message ?? null,
            title,
          }).catch((error) => reportBackgroundError("notification.system-toast", error));
        }
      },
      clear: (id: number) => {
        set((s) => {
          const removed = s.items.find((i) => i.id === id);
          const items = s.items.filter((i) => i.id !== id);
          const dismissed = removed
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
                  ...s.dismissed,
                ],
                Date.now()
              )
            : s.dismissed;
          return {
            items,
            dismissed,
            unreadCount: items.filter((i) => !i.read).length,
          };
        });
      },
      clearAll: () => {
        const now = Date.now();
        set((s) => {
          const dismissed = pruneDismissed(
            s.items.reduce<DismissedEntry[]>(
              (entries, item) => [
                {
                  signature: notificationSignature(
                    item.type,
                    item.title,
                    item.message,
                    item.target
                  ),
                  ...(item.eventKey ? { eventKey: item.eventKey } : {}),
                  at: now,
                },
                ...entries,
              ],
              s.dismissed
            ),
            now
          );
          return { items: [], dismissed, unreadCount: 0 };
        });
      },
      dismissed: [],
      items: [],
      markAllRead: () => {
        set((s) => ({
          items: s.items.map((i) => ({ ...i, read: true })),
          unreadCount: 0,
        }));
      },
      markRead: (id: number) => {
        set((s) => {
          const items = s.items.map((i) => (i.id === id ? { ...i, read: true } : i));
          return { items, unreadCount: items.filter((i) => !i.read).length };
        });
      },
      unreadCount: 0,
    }),
    {
      merge: (persisted, current) => {
        const [stored, storageError] = attemptSync(
          () => notificationStorage?.getItem(NOTIFICATION_STORAGE_KEY) != null
        );
        if (storageError !== null)
          reportBackgroundError("notification.storage.check", storageError);
        const storageStillExists = stored === true;
        const persistedState = persisted as
          | { items?: NotificationItem[]; dismissed?: DismissedEntry[] }
          | undefined;
        const items = (storageStillExists ? persistedState?.items : undefined) ?? current.items;
        const dismissed = storageStillExists
          ? pruneDismissed(persistedState?.dismissed ?? [], Date.now())
          : current.dismissed;
        const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);
        nextId = maxId + 1;
        return {
          ...current,
          items,
          dismissed,
          unreadCount: items.filter((item) => !item.read).length,
        };
      },
      name: NOTIFICATION_STORAGE_KEY,
      partialize: (s) => ({ items: s.items, dismissed: s.dismissed }),
      storage: notificationStorage,
      version: 1,
    }
  )
);
