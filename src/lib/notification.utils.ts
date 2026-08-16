import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { translate } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { useNotificationStore } from "@/store/notification.store";
import type { Locale, TranslationVariables } from "@/types";
import type { NotificationItem, NotificationType } from "@/types/notification";

function show(title: string, type: NotificationType, body?: string): void {
  useNotificationStore.getState().add(title, type, body);
}

export function showError(title: string, body: string): void {
  show(title, "error", body);
}

export function showWarning(title: string, body: string): void {
  show(title, "warning", body);
}

export function showSuccess(title: string, body: string): void {
  show(title, "success", body);
}

export function showInfo(title: string, body: string): void {
  show(title, "info", body);
}

export function copyNotification(item: NotificationItem): Promise<void> {
  const lines = [`[${item.type}] ${item.title}`];
  if (item.message) lines.push(item.message);
  lines.push(new Date(item.timestamp).toLocaleString());
  return writeText(lines.join("\n"));
}

type Translate = (
  key: TranslationKey,
  variables?: TranslationVariables
) => string;

export function formatRelativeTime(
  timestamp: number,
  t: Translate,
  now: number = Date.now()
): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("notification.justNow");
  if (minutes < 60) return t("notification.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notification.hoursAgo", { count: hours });
  return t("notification.daysAgo", { count: Math.floor(hours / 24) });
}

export interface ShowNotificationPayload {
  title?: string;
  body?: string;
  type?: string;
  eventKey?: string;
  titleKey?: string;
  titleVars?: TranslationVariables;
  bodyKey?: string;
  bodyVars?: TranslationVariables;
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
