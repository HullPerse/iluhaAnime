import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useModalResize } from "@/hooks/modalResize.hook";
import { useOverlayDialog } from "@/hooks/overlay.hook";
import { isTextEntryTarget } from "@/lib/core/filterHotkeys.utils";
import { scheduleTask } from "@/lib/core/shared.utils";
import { getContentSignature } from "@/lib/ui/modalSignature.utils";
import { useCell } from "@/lib/core/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { ModalWindow } from "@/types/core/ui";

import { Button } from "@/components/ui/button.component";

const MODAL_CONTENT_FADE_MS = 150;

function Modal({
  header,
  onClose,
  canClose,
  onBack,
  headerActions,
  pager,
  className,
  contentClassName,
  hideHeader = false,
  hideBackdrop = false,
  modal = true,
  children,
}: ModalWindow) {
  const { t } = useI18n();
  const modalAnimation = useCell(settingsAtoms.modalAnimation);
  const animateModalContent = useCell(settingsAtoms.animateModalContent);
  const enable3dBorders = useCell(settingsAtoms.enable3dBorders);
  const backdropOpacity = useCell(settingsAtoms.modalBackdropOpacity);
  const [visible, setVisible] = useState(false);
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);
  const contentElement = useRef<HTMLDivElement>(null);
  const prevContentSignatureRef = useRef<string | undefined>(undefined);
  const contentSignature = getContentSignature(children);
  useOverlayDialog();
  useModalResize(popupElement, modalAnimation);

  useEffect(() => {
    if (!modalAnimation) {
      setVisible(true);
      return;
    }
    const task = scheduleTask("raf", 0, () => setVisible(true));
    return () => task.cancel();
  }, [modalAnimation]);

  useEffect(() => {
    if (!animateModalContent) return;
    const previous = prevContentSignatureRef.current;
    prevContentSignatureRef.current = contentSignature;
    if (previous === undefined || previous === contentSignature) return;
    const element = contentElement.current;
    if (element === null) return;
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: MODAL_CONTENT_FADE_MS,
      easing: "ease-out",
    });
    return () => animation.cancel();
  }, [animateModalContent, contentSignature]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof document === "undefined") return;
    const task = scheduleTask("timeout", 0, () => {
      if (document.querySelectorAll('[role="dialog"]').length > 1) {
        console.warn(
          "[modal] stacked dialogs detected: keep one Modal per screen and swap content with onBack"
        );
      }
    });
    return () => task.cancel();
  }, []);

  return (
    <Dialog.Root
      defaultOpen
      modal={modal}
      onOpenChange={(open, details) => {
        if (open) return;
        if (canClose && !canClose()) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <Dialog.Portal className="z-9999">
        {!hideBackdrop && (
          <Dialog.Backdrop
            className={cn(
              "fixed inset-0 z-40",
              modalAnimation && "modal-motion transition-opacity duration-150 ease-out",
              visible ? "opacity-100" : "opacity-0"
            )}
            style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity / 100})` }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
        <Dialog.Popup
          ref={setPopupElement}
          className={cn(
            "bg-primary windows95-active-border fixed top-1/2 left-1/2 z-50 flex h-fit max-h-[80%] min-h-42 w-fit max-w-[80%] -translate-x-1/2 -translate-y-1/2 flex-col items-center",
            modalAnimation && "modal-motion transition-[opacity,scale] duration-150 ease-out",
            modalAnimation && (visible ? "scale-[1] opacity-100" : "scale-[0.97] opacity-0"),
            enable3dBorders && "windows95-3d-border",
            className
          )}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(event) => {
            if (!pager || pager.total < 2) return;
            if (isTextEntryTarget(event.target)) return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              pager.onPrevious();
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              pager.onNext();
            }
          }}
          data-hotkeys-disabled
          data-no-wheel
        >
          {hideHeader && <Dialog.Title className="sr-only">{header}</Dialog.Title>}
          {!hideHeader && (
            <section className="ui-titlebar w-full justify-between">
              <div className="flex min-w-0 flex-row items-center gap-1">
                {onBack && (
                  <Button
                    onClick={onBack}
                    size="icon"
                    className="size-4"
                    aria-label={t("common.back")}
                    title={t("common.back")}
                  >
                    <ChevronLeft className="size-2.5" />
                  </Button>
                )}
                <ImageComponent src="/images/w2k_computer.ico" alt="" className="size-4 shrink-0" />
                <Dialog.Title className="windows95-text text-title-text line-clamp-1 font-bold">
                  {header}
                </Dialog.Title>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-0.5">
                {headerActions}
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
            ref={contentElement}
            className={cn(
              "bg-primary flex w-full flex-1 flex-col gap-2 overflow-y-auto p-3",
              contentClassName
            )}
          >
            {children}
          </section>
          {pager && pager.total > 1 && (
            <section
              role="group"
              aria-label={pager.label}
              className="bg-primary flex w-full shrink-0 flex-row items-center justify-center gap-1 px-3 pb-2"
            >
              <Button
                size="icon"
                className="size-5"
                aria-label={t("common.previous")}
                title={t("common.previous")}
                onClick={() => pager.onPrevious()}
              >
                <ChevronLeft className="size-3" />
              </Button>
              <span className="windows95-text text-xs">
                {pager.index + 1} / {pager.total}
              </span>
              <Button
                size="icon"
                className="size-5"
                aria-label={t("common.next")}
                title={t("common.next")}
                onClick={() => pager.onNext()}
              >
                <ChevronRight className="size-3" />
              </Button>
            </section>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default Modal;
