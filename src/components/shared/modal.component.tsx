import { ModalWindow } from "@/types";
import { Button } from "../ui/button.component";
import { X } from "lucide-react";

function Modal({ header, onClose, children }: ModalWindow) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        data-no-wheel
      />
      <main className="flex flex-col fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 items-center min-w-3xl w-[86vw] h-fit min-h-42 max-h-[86vh] windows95-active-border bg-primary">
        <section className="flex flex-row items-center justify-between bg-secondary w-full p-1">
          <span className="text-white windows95-text font-bold line-clamp-1">
            {header}
          </span>
          <Button size="icon" className="size-4" onClick={onClose}>
            <X />
          </Button>
        </section>
        <section
          className="flex flex-col gap-1 p-2 overflow-hidden flex-1 w-full"
          data-no-wheel
        >
          {children}
        </section>
      </main>
    </>
  );
}

export default Modal;
