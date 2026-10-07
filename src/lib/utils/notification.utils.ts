import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";

import { translate } from "@/lib/locale/i18n.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { formatDistanceToNowOwn } from "@/lib/utils/distance.utils";
import { openAnimeDeepLink } from "@/store/deeplink.store";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { Locale, TranslationKey } from "@/types/i18n";
import type {
  NotificationFilter,
  NotificationItem,
  NotificationTarget,
  NotificationType,
  ShowNotificationPayload,
} from "@/types/notification";

function show(title: string, type: NotificationType, body?: string): void {
  addNotification(title, type, body);
}

export function showError(title: string, body: string): void {
  show(title, "error", body);
}

export function showErrorOnce(eventKey: string, title: string, body: string): void {
  addNotification(title, "error", body, eventKey);
}

export function showInfo(title: string, body?: string): void {
  show(title, "info", body);
}

export function showWarning(title: string, body?: string): void {
  show(title, "warning", body);
}

export function copyNotification(item: NotificationItem): Promise<void> {
  const lines = [`[${item.type}] ${item.title}`];
  if (item.message) lines.push(item.message);
  lines.push(new Date(item.timestamp).toLocaleString());
  return writeText(lines.join("\n"));
}

export function formatRelativeTime(timestamp: number, locale: Locale): string {
  return formatDistanceToNowOwn(timestamp, locale);
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

export type NotificationTargetResult = "opened" | "tab-disabled" | "failed";

export async function openNotificationTarget(
  target: NotificationTarget
): Promise<NotificationTargetResult> {
  if (target.source === "folder") {
    const [, error] = await attempt(openPath(target.path));
    if (error === null) return "opened";
    reportBackgroundError("notification.open.folder", error);
    return "failed";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const language = settingsAtoms.language.get();
    showWarning(
      translate(language, "network.offline.title"),
      translate(language, "network.action.unavailable")
    );
    return "failed";
  }
  if (!settingsAtoms.anilistTabEnabled.get()) return "tab-disabled";
  openAnimeDeepLink(target);
  return "opened";
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
