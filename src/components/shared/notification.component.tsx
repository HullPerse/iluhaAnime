import { useState, useRef, useEffect } from "react";
import { useNotificationStore } from "@/store/notification.store";
import { Button } from "@/components/ui/button.component";
import { Bell, BellDot, X, CheckCheck, Trash2 } from "lucide-react";

const typeColors: Record<string, string> = {
  info: "text-blue-600",
  success: "text-green-600",
  warning: "text-orange-500",
  error: "text-red-600",
};

export default function NotificationTray() {
  const { items, unreadCount, markRead, markAllRead, clear, clearAll } =
    useNotificationStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        size="icon"
        className="h-5 w-5 relative"
        onClick={() => setOpen((v) => !v)}
        title="Уведомления"
      >
        {unreadCount > 0 ? (
          <>
            <BellDot className="size-3" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 size-3.5 text-[8px] bg-destructive text-white flex items-center justify-center rounded-full">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </>
        ) : (
          <Bell className="size-3" />
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 z-50 windows95-border bg-white shadow-md">
          <div className="flex items-center justify-between px-1 py-0.5 bg-primary border-b border-muted">
            <span className="text-[10px] font-bold windows95-text">
              Уведомления ({items.length})
            </span>
            <div className="flex gap-0.5">
              <Button
                size="icon"
                className="h-4 w-4"
                onClick={markAllRead}
                title="Прочитать все"
                disabled={unreadCount === 0}
              >
                <CheckCheck className="size-2.5" />
              </Button>
              <Button
                size="icon"
                className="h-4 w-4"
                onClick={clearAll}
                title="Очистить все"
                disabled={items.length === 0}
              >
                <Trash2 className="size-2.5" />
              </Button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 && (
              <div className="flex items-center justify-center py-4 text-[10px] text-muted">
                Нет уведомлений
              </div>
            )}
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-1 px-1 py-0.5 border-b border-muted/30 cursor-pointer hover:bg-surface/50 ${item.read ? "opacity-60" : ""}`}
                onClick={() => {
                  markRead(item.id);
                }}
              >
                <span className={`text-[10px] mt-0.5 shrink-0 ${typeColors[item.type]}`}>
                  {item.type === "error" ? "✕" : item.type === "success" ? "✓" : item.type === "warning" ? "⚠" : "ⓘ"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold truncate windows95-text">
                    {item.title}
                  </div>
                  {item.message && (
                    <div className="text-[9px] text-muted truncate">{item.message}</div>
                  )}
                </div>
                <Button
                  size="icon"
                  className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    clear(item.id);
                  }}
                >
                  <X className="size-2" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
