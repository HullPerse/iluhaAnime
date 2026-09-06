import { cn } from "cn";
import { ChevronLeft, Monitor, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";

export function OverlayWindow({
  header,
  onBack,
  onClose,
  children,
}: {
  header: string;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const modalAnimation = useSettingsStore((s) => s.modalAnimation);
  const enable3dBorders = useSettingsStore((s) => s.enable3dBorders);
  const backdropOpacity = useSettingsStore((s) => s.modalBackdropOpacity);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!modalAnimation) {
      setVisible(true);
      return;
    }
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [modalAnimation]);

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center">
      <div
        className={cn(
          "absolute inset-0",
          modalAnimation && "transition-opacity duration-150",
          visible ? "opacity-100" : "opacity-0"
        )}
        style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity / 100})` }}
        onClick={onClose}
      />
      <div
        className={cn(
          "bg-primary windows95-active-border relative flex h-fit max-h-[80%] min-h-42 w-fit max-w-[80%] min-w-lg flex-col",
          modalAnimation && "transition-opacity duration-150",
          visible ? "opacity-100" : "opacity-0",
          enable3dBorders && "windows95-3d-border"
        )}
      >
        <section className="bg-secondary flex w-full flex-row items-center justify-between p-1">
          <div className="flex min-w-0 flex-row items-center gap-1">
            {onBack && (
              <Button
                onClick={onBack}
                size="icon"
                className="size-4"
                aria-label={t("common.previous")}
              >
                <ChevronLeft className="size-2.5" />
              </Button>
            )}
            <Monitor className="size-3 shrink-0 text-white" />
            <span className="windows95-text line-clamp-1 font-bold text-white">{header}</span>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-0.5">
            <button
              type="button"
              aria-label={t("common.close")}
              title={t("common.close")}
              onClick={onClose}
              className="windows95-active-border bg-primary text-text windows95-text flex size-4 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
            >
              <X className="size-2.5" />
            </button>
          </div>
        </section>
        <section className="bg-primary flex w-full flex-1 flex-col gap-1 overflow-y-auto p-2">
          {children}
        </section>
      </div>
    </div>
  );
}
