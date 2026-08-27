import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useState } from "react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { ModalWindow } from "@/types";

import { Button } from "../ui/button.component";

function Modal({
  header,
  onClose,
  onBack,
  className,
  contentClassName,
  hideHeader = false,
  hideBackdrop = false,
  modal = true,
  children,
}: ModalWindow) {
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
    <Dialog.Root
      defaultOpen
      modal={modal}
      onOpenChange={(e) => {
        if (!e) onClose();
      }}
    >
      <Dialog.Portal className="z-9999">
        {!hideBackdrop && (
          <Dialog.Backdrop
            className={`fixed inset-0 z-40 ${modalAnimation ? "transition-opacity duration-150" : ""} ${visible ? "opacity-100" : "opacity-0"}`}
            style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity / 100})` }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
        <Dialog.Popup
          className={cn(
            "bg-primary windows95-active-border fixed top-1/2 left-1/2 z-50 flex h-fit max-h-[80%] min-h-42 w-fit max-w-[80%] -translate-x-1/2 -translate-y-1/2 flex-col items-center",
            modalAnimation ? "transition-opacity duration-150" : "",
            visible ? "opacity-100" : "opacity-0",
            enable3dBorders ? "windows95-3d-border" : "",
            className
          )}
          onClick={(e) => e.stopPropagation()}
          data-hotkeys-disabled
          data-no-wheel
        >
          {hideHeader && (
            <Dialog.Title className="sr-only">{header}</Dialog.Title>
          )}
          {!hideHeader && (
            <section className="ui-titlebar w-full justify-between">
              <div className="flex min-w-0 flex-row items-center gap-1">
                {onBack && (
                  <Button onClick={onBack} size="icon" className="size-4">
                    <ChevronLeft className="size-2.5" />
                  </Button>
                )}
                <ImageComponent
                  src="/images/w2k_computer.ico"
                  alt=""
                  className="size-4 shrink-0"
                />
                <Dialog.Title className="windows95-text line-clamp-1 font-bold text-white">
                  {header}
                </Dialog.Title>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-0.5">
                <Dialog.Close
                  aria-label={t("common.close")}
                  title={t("common.close")}
                  className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
                  onClick={(e) => e.stopPropagation()}
                >
                  <X className="size-2.5" />
                </Dialog.Close>
              </div>
            </section>
          )}
          <section
            className={cn(
              "bg-primary flex w-full flex-1 flex-col gap-2 overflow-y-auto p-3",
              contentClassName
            )}
          >
            {children}
          </section>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default Modal;
