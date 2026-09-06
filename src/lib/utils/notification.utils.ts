import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { translate } from "@/lib/locale/i18n.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { Locale } from "@/types";
import type { TFunc, TranslationKey } from "@/types/i18n";
import type {
  NotificationFilter,
  NotificationItem,
  NotificationType,
  ShowNotificationPayload,
} from "@/types/notification";

function show(title: string, type: NotificationType, body?: string): void {
  useNotificationStore.getState().add(title, type, body);
}

export function showError(title: string, body: string): void {
  show(title, "error", body);
}

export function copyNotification(item: NotificationItem): Promise<void> {
  const lines = [`[${item.type}] ${item.title}`];
  if (item.message) lines.push(item.message);
  lines.push(new Date(item.timestamp).toLocaleString());
  return writeText(lines.join("\n"));
}

export function formatRelativeTime(timestamp: number, t: TFunc, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("notification.just.now");
  if (minutes < 60) return t("notification.minutes.ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notification.hours.ago", { count: hours });
  return t("notification.days.ago", { count: Math.floor(hours / 24) });
}

export function resolveNotificationText(
  payload: ShowNotificationPayload,
  locale: Locale
): { title: string; body: string } {
  const title = payload.titleKey
    ? translate(locale, payload.titleKey as TranslationKey, payload.titleVars)
    : (payload.title ?? "");
  const body = payload.bodyKey
    ? translate(locale, payload.bodyKey as TranslationKey, payload.bodyVars)
    : (payload.body ?? "");
  return { body, title };
}

export const COPIED_FEEDBACK_MS = 1500;

export function getVisibleNotifications(
  allItems: NotificationItem[],
  currentFilter: NotificationFilter
): NotificationItem[] {
  if (currentFilter === "downloads") return [];
  if (currentFilter === "all") return allItems;
  return allItems.filter((i) => i.type === currentFilter);
}
