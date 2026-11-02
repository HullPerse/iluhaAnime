import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import type { NotificationFilter, NotificationType } from "@/types/core/notification";
import type { NotificationPopupMode } from "@/types/ui/settings";
import type { ToastDefaults } from "@/types/core/notifications";
import data from "./notifications.data.json";

const NotificationsDataSchema = z.object({
  NOTIFICATION_FILTER_KEYS: z.record(z.string(), z.string()),
  NOTIFICATION_FILTERS: z.array(z.string()),
  NOTIFICATION_POPUP_KEYS: z.record(z.string(), z.string()),
  NOTIFICATION_POPUP_MODES: z.array(z.string()),
  NOTIFICATION_TOAST_STRIP: z.record(z.string(), z.string()),
  NOTIFICATION_TYPE_COLORS: z.record(z.string(), z.string()),
  POLL_INTERVALS_MIN: z.array(z.number()),
  TOAST_ACTIVATED_EVENT: z.string(),
  TOAST_DEFAULTS: z.object({ durationMs: z.number(), maxVisible: z.number() }),
  TOAST_DURATION_MS: z.record(z.string(), z.number()),
});

const parsed = NotificationsDataSchema.parse(data);

export const TOAST_ACTIVATED_EVENT = parsed.TOAST_ACTIVATED_EVENT;
export const POLL_INTERVALS_MIN = parsed.POLL_INTERVALS_MIN as number[];
export const NOTIFICATION_FILTERS = parsed.NOTIFICATION_FILTERS as readonly NotificationFilter[];
export const NOTIFICATION_FILTER_KEYS = parsed.NOTIFICATION_FILTER_KEYS as Record<NotificationFilter, TranslationKey>;
export const NOTIFICATION_TYPE_COLORS = parsed.NOTIFICATION_TYPE_COLORS as Record<NotificationType, string>;
export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  error: XCircle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
};
export const NOTIFICATION_POPUP_MODES = parsed.NOTIFICATION_POPUP_MODES as readonly NotificationPopupMode[];
export const NOTIFICATION_POPUP_KEYS = parsed.NOTIFICATION_POPUP_KEYS as Record<NotificationPopupMode, TranslationKey>;
export const NOTIFICATION_TOAST_STRIP = parsed.NOTIFICATION_TOAST_STRIP as Record<NotificationType, string>;
export const TOAST_DEFAULTS = parsed.TOAST_DEFAULTS as ToastDefaults;
export const TOAST_DURATION_MS = parsed.TOAST_DURATION_MS as Record<NotificationType, number>;