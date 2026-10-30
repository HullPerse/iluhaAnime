import Modal from "@/components/shared/modal.component";
import { useCell } from "@/lib/signal.hook";
import { clearModalScope, modalAtoms, popModal } from "@/store/modal.store";
import type { ModalEntry, ModalScope } from "@/types/modal";
import type { ModalHostContent } from "@/types/modalHost";

export function ModalHost({
  scope,
  onClose,
  resolve,
}: {
  scope: ModalScope;
  onClose?: () => void;
  resolve: (entry: ModalEntry) => ModalHostContent | null;
}) {
  const stacks = useCell(modalAtoms.stacks);
  const stack = stacks[scope];
  const top = stack.at(-1);
  if (!top) return null;
  const content = resolve(top);
  if (!content) return null;
  const handleClose = () => {
    clearModalScope(scope);
    onClose?.();
  };
  return (
    <Modal
      header={content.header}
      onClose={handleClose}
      onBack={stack.length > 1 ? () => popModal(scope) : undefined}
      headerActions={content.headerActions}
      className={content.className}
    >
      {content.body}
    </Modal>
  );
}
