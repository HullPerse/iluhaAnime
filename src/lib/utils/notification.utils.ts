import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";
import { formatDistanceToNow } from "date-fns";

import { translate } from "@/lib/locale/i18n.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { dateFnsLocale } from "@/lib/utils/date.utils";
import { useDeepLinkStore } from "@/store/deeplink.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Locale, TranslationKey } from "@/types/i18n";
import type {
  NotificationFilter,
  NotificationItem,
  NotificationTarget,
  NotificationType,
  ShowNotificationPayload,
} from "@/types/notification";

function show(title: string, type: NotificationType, body?: string): void {
  useNotificationStore.getState().add(title, type, body);
}

export function showError(title: string, body: string): void {
  show(title, "error", body);
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

export function formatRelativeTime(timestamp: number, locale: string): string {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: dateFnsLocale(locale) });
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
    const language = useSettingsStore.getState().language;
    showWarning(
      translate(language, "network.offline.title"),
      translate(language, "network.action.unavailable")
    );
    return "failed";
  }
  if (!useSettingsStore.getState().anilistTabEnabled) return "tab-disabled";
  useDeepLinkStore.getState().openAnime(target);
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
