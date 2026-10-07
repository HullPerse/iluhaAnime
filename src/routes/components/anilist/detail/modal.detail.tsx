import Modal from "@/components/shared/modal.component";
import type { AniDetailProps as DetailProps } from "@/types/anilist";

import { AnimeDetailShell } from "./shell.detail";

function AniListDetailModal(props: DetailProps) {
  return (
    <AnimeDetailShell
      {...props}
      render={({ title, actions, onBack, body }) => (
        <Modal
          header={title}
          onClose={props.onClose}
          onBack={onBack}
          headerActions={actions}
          className="min-w-2xl"
        >
          {body}
        </Modal>
      )}
    />
  );
}

export default AniListDetailModal;
