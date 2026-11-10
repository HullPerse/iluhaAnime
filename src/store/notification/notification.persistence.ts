import { attemptSync } from "@hullperse/hp_utils/attempt";
import { isRecord } from "@/lib/core/text/record.utils";
import type { DismissedEntry, NotificationItem, NotificationType } from "@/types/core/notification";

const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSED = 200;
export const NOTIFICATION_STORAGE_KEY = "notifications";

export function targetKey(target: NotificationItem["target"]): string {
  if (!target) return "";
  return target.source === "folder" ? `folder:${target.path}` : `anilist:${target.id}`;
}

export function notificationSignature(
  type: NotificationType,
  title: string,
  message?: string,
  target?: NotificationItem["target"]
): string {
  return `${type}\u0000${title}\u0000${message ?? ""}\u0000${targetKey(target)}`;
}

export function isNotificationItem(value: unknown): value is NotificationItem {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.timestamp === "number" &&
    typeof value.read === "boolean"
  );
}

export function isDismissedEntry(value: unknown): value is DismissedEntry {
  return isRecord(value) && typeof value.signature === "string" && typeof value.at === "number";
}

export function pruneDismissed(dismissed: DismissedEntry[], now: number): DismissedEntry[] {
  return dismissed.filter((entry) => now - entry.at < DISMISS_TTL_MS).slice(0, MAX_DISMISSED);
}

export function unreadCountOf(items: NotificationItem[]): number {
  return items.filter((item) => !item.read && !item.popupOnly).length;
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

export function readLegacyNotifications(
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
