import { create } from "zustand";
import { sendNotification as tauriNotify } from "@tauri-apps/plugin-notification";

export type NotificationType = "info" | "success" | "warning" | "error";

interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
}

interface NotificationStore {
  items: NotificationItem[];
  unreadCount: number;
  add: (title: string, type?: NotificationType, message?: string) => void;
  addInApp: (title: string, type?: NotificationType, message?: string) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  clear: (id: number) => void;
  clearAll: () => void;
}

let nextId = 1;

export const useNotificationStore = create<NotificationStore>((set, _get) => ({
  items: [],
  unreadCount: 0,

  add: (title: string, type: NotificationType = "info", message?: string) => {
    const id = nextId++;
    const item: NotificationItem = { id, type, title, message, timestamp: Date.now(), read: false };

    set((s) => ({
      items: [item, ...s.items].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    }));

    try { tauriNotify({ title, body: message ?? "" }); } catch {}
  },

  addInApp: (title: string, type: NotificationType = "info", message?: string) => {
    const id = nextId++;
    const item: NotificationItem = { id, type, title, message, timestamp: Date.now(), read: false };

    set((s) => ({
      items: [item, ...s.items].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    }));
  },

  markRead: (id: number) => {
    set((s) => {
      const items = s.items.map((i) => (i.id === id ? { ...i, read: true } : i));
      return { items, unreadCount: items.filter((i) => !i.read).length };
    });
  },

  markAllRead: () => {
    set((s) => ({
      items: s.items.map((i) => ({ ...i, read: true })),
      unreadCount: 0,
    }));
  },

  clear: (id: number) => {
    set((s) => {
      const items = s.items.filter((i) => i.id !== id);
      return { items, unreadCount: items.filter((i) => !i.read).length };
    });
  },

  clearAll: () => {
    set({ items: [], unreadCount: 0 });
  },
}));
