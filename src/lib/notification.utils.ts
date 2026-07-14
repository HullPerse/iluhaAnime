import { useNotificationStore } from "@/store/notification.store";

export async function showError(title: string, body: string): Promise<void> {
  useNotificationStore.getState().add(title, "error", body);
}
