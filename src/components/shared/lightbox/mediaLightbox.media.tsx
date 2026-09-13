import Modal from "@/components/shared/modal.component";
import type { MediaLightboxContentProps } from "@/types/media";

import { MediaLightboxContent } from "./mediaLightboxContent.media";

export function MediaLightbox({
  title,
  onClose,
  onBack,
  ...content
}: MediaLightboxContentProps & {
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <Modal header={title} onClose={onClose} onBack={onBack}>
      <MediaLightboxContent {...content} />
    </Modal>
  );
}
