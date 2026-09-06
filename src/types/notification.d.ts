import type { TranslationVariables } from "./i18n";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  message?: string;
  eventKey?: string;
  timestamp: number;
  read: boolean;
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
    options?: { system?: boolean }
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
}

export type NotificationFilter = NotificationType | "all" | "downloads";
