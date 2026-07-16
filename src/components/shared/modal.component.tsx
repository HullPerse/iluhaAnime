import { Dialog } from "@base-ui/react/dialog";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/index.utils";
import { ChevronLeft, Monitor, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModalWindow } from "@/types";
import { Button } from "../ui/button.component";

function Modal({ header, onClose, onBack, className, children }: ModalWindow) {
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
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={`fixed inset-0 z-40 ${modalAnimation ? "transition-opacity duration-150" : ""} ${visible ? "opacity-100" : "opacity-0"}`}
          style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity / 100})` }}
        />
        <Dialog.Popup
          className={cn(
            "flex flex-col fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 items-center min-xl w-fit max-w-[80%] min-h-42 h-fit max-h-[80%] bg-primary windows95-active-border",
            modalAnimation ? "transition-opacity duration-150" : "",
            visible ? "opacity-100" : "opacity-0",
            enable3dBorders ? "windows95-3d-border" : "",
            className,
          )}
          data-hotkeys-disabled
          data-no-wheel
        >
          <section className="flex flex-row items-center justify-between bg-secondary w-full p-1">
            <div className="flex flex-row items-center gap-1 min-w-0">
              {onBack && (
                <Button onClick={onBack} size="icon" className="size-4">
                  <ChevronLeft className="size-2.5" />
                </Button>
              )}
              <Monitor className="size-3 shrink-0 text-white" />
              <Dialog.Title className="text-white windows95-text font-bold line-clamp-1">
                {header}
              </Dialog.Title>
            </div>
            <div className="flex flex-row items-center gap-0.5 shrink-0">
              <Dialog.Close className="size-4 flex items-center justify-center windows95-active-border bg-primary text-text windows95-text cursor-pointer hover:brightness-110 active:translate-x-px active:translate-y-px">
                <X className="size-2.5" />
              </Dialog.Close>
            </div>
          </section>
          <section className="flex flex-col gap-1 p-2 overflow-y-auto flex-1 w-full bg-primary">
            {children}
          </section>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default Modal;
