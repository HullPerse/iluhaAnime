import type { AnimeDeepLink } from "./deeplink";
import type { Locale } from "./i18n";
import type { TranslationKey, TranslationVariables } from "./i18n";

export type NotificationType = "info" | "success" | "warning" | "error";

export type NotificationTarget =
  | AnimeDeepLink
  | { readonly source: "folder"; readonly path: string };

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  message?: string;
  eventKey?: string;
  target?: NotificationTarget;
  timestamp: number;
  read: boolean;
}

export interface NotificationAddOptions {
  system?: boolean;
  target?: NotificationTarget;
}

export interface DismissedEntry {
  signature: string;
  eventKey?: string;
  at: number;
}

export interface NotificationStore {
  items: NotificationItem[];
  unreadCount: number;
  dismissed: DismissedEntry[];
  add: (
    title: string,
    type?: NotificationType,
    message?: string,
    eventKey?: string,
    options?: NotificationAddOptions
  ) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  clear: (id: number) => void;
  clearAll: () => void;
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
  action?: NotificationTarget;
}

export type NotificationFilter = NotificationType | "all" | "downloads";

export interface NotificationRowProps {
  item: NotificationItem;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
  locale: Locale;
  markRead: (id: number) => void;
  clear: (id: number) => void;
  onOpen: (item: NotificationItem) => void;
}
