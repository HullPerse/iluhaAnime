import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/types/i18n";
import type { NotificationFilter, NotificationType } from "@/types/notification";

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
