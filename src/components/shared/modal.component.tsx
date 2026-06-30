import { ModalWindow } from "@/types";
import { Button } from "../ui/button.component";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/index.utils";

function Modal({ header, onClose, className, children }: ModalWindow) {
  const modalAnimation = useSettingsStore((s) => s.modalAnimation);
  const enable3dBorders = useSettingsStore((s) => s.enable3dBorders);
  const backdropOpacity = useSettingsStore((s) => s.modalBackdropOpacity);
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!modalAnimation) {
      setVisible(true);
      return;
    }
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [modalAnimation]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${modalAnimation ? "transition-opacity duration-150" : ""} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity / 100})` }}
        onClick={onClose}
        data-no-wheel
      />
      <main
        className={cn(
          "flex flex-col fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 items-center min-xl w-fit max-w-[80%] min-h-42 h-fit max-h-[80%] bg-primary windows95-active-border",
          modalAnimation ? "transition-opacity duration-150" : "",
          visible ? "opacity-100" : "opacity-0",
          enable3dBorders ? "windows95-3d-border" : "",
          className,
        )}
      >
        <section className="flex flex-row items-center justify-between bg-secondary w-full p-1">
          <span className="text-white windows95-text font-bold line-clamp-1">
            {header}
          </span>
          <Button size="icon" className="size-4" onClick={onClose}>
            <X />
          </Button>
        </section>
        <section
          className="flex flex-col gap-1 p-2 overflow-hidden flex-1 w-full bg-primary"
          data-no-wheel
        >
          {children}
        </section>
      </main>
    </>
  );
}

export default Modal;
