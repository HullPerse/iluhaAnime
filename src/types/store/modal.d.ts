import type { Cell } from "@/types/core/signal";
import type { ModalStore } from "@/types/ui/modal";

type ModalData = Pick<ModalStore, "stacks">;

export interface ModalSignalStore {
  atoms: { [K in keyof ModalData]: Cell<ModalData[K]> };
  push: ModalStore["push"];
  replace: ModalStore["replace"];
  pop: ModalStore["pop"];
  clearScope: ModalStore["clearScope"];
  clearAll: ModalStore["clearAll"];
  batch: ModalStore["batch"];
}
