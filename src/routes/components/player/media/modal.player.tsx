import { cn } from "cn";
import { Monitor, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SelectPortalContainerContext } from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";

function PlayerModal({
  header,
  onClose,
  className,
  children,
}: {
  header: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      dialog.removeEventListener("close", handleClose);
    };
  }, []);

  return (
    <>
      <style>{`dialog.player-modal::backdrop{background:transparent;}`}</style>
      <dialog
        ref={(node) => {
          dialogRef.current = node;
          setPortalContainer(node);
        }}
        aria-label={header}
        className="player-modal fixed inset-0 z-40 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center bg-black/50 p-0"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        data-hotkeys-disabled
        data-no-wheel
      >
        <SelectPortalContainerContext.Provider value={portalContainer}>
          <section
            className={cn(
              "windows95-active-border bg-primary flex max-h-[80%] flex-col",
              className
            )}
          >
            <section className="bg-secondary flex w-full flex-row items-center justify-between p-1">
              <div className="flex min-w-0 flex-row items-center gap-1">
                <Monitor className="size-3 shrink-0 text-white" />
                <span className="windows95-text line-clamp-1 font-bold text-white">{header}</span>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-0.5">
                <button
                  type="button"
                  className="windows95-active-border windows95-text bg-primary text-text flex size-4 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
                  aria-label={t("player.media.panel.close")}
                  onClick={onClose}
                >
                  <X className="size-2.5" />
                </button>
              </div>
            </section>
            <section className="bg-primary flex w-full flex-1 flex-col gap-1 overflow-y-auto p-2">
              {children}
            </section>
          </section>
        </SelectPortalContainerContext.Provider>
      </dialog>
    </>
  );
}

export default PlayerModal;
