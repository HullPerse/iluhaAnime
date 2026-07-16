import { useNotificationStore } from "@/store/notification.store";

type ToastType = "info" | "error" | "success" | "warning";

export function showToast(message: string, type: ToastType = "info") {
  const labelMap: Record<string, string> = {
    info: "Инфо",
    error: "Ошибка",
    success: "Готово",
    warning: "Внимание",
  };
  useNotificationStore.getState().add(labelMap[type] ?? "Инфо", type as any, message);
}
