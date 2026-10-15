import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/types/i18n";
import type { NotificationFilter, NotificationType } from "@/types/notification";
import type { NotificationPopupMode } from "@/types/settings";

export const TOAST_ACTIVATED_EVENT = "notification-activated";

export const POLL_INTERVALS_MIN = [5, 15, 30, 60, 120];

export const NOTIFICATION_FILTERS: readonly NotificationFilter[] = [
  "all",
  "info",
  "success",
  "warning",
  "error",
  "downloads",
];

export const NOTIFICATION_FILTER_KEYS: Record<NotificationFilter, TranslationKey> = {
  all: "notification.filter.all",
  downloads: "notification.filter.downloads",
  error: "notification.filter.error",
  info: "notification.filter.info",
  success: "notification.filter.success",
  warning: "notification.filter.warning",
};

export const NOTIFICATION_TYPE_COLORS: Record<NotificationType, string> = {
  error: "text-red-600",
  info: "text-blue-600",
  success: "text-green-600",
  warning: "text-orange-500",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  error: XCircle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
};

export const NOTIFICATION_POPUP_MODES: readonly NotificationPopupMode[] = [
  "off",
  "system",
  "inapp",
  "both",
];

export const NOTIFICATION_POPUP_KEYS: Record<NotificationPopupMode, TranslationKey> = {
  off: "settings.notifications.popups.off",
  system: "settings.notifications.popups.system",
  inapp: "settings.notifications.popups.inapp",
  both: "settings.notifications.popups.both",
};

export const NOTIFICATION_TOAST_STRIP: Record<NotificationType, string> = {
  error: "bg-red-600",
  info: "bg-blue-700",
  success: "bg-green-600",
  warning: "bg-yellow-500",
};



export interface ToastDefaults {
  durationMs: number;
  maxVisible: number;
}

export const TOAST_DEFAULTS: ToastDefaults = {
  durationMs: 8000,
  maxVisible: 4,
};

export const TOAST_DURATION_MS: Record<NotificationType, number> = {
  error: TOAST_DEFAULTS.durationMs,
  info: TOAST_DEFAULTS.durationMs,
  success: TOAST_DEFAULTS.durationMs,
  warning: TOAST_DEFAULTS.durationMs,
};
