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
    eventKey?: string
  ) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  clear: (id: number) => void;
  clearAll: () => void;
}
