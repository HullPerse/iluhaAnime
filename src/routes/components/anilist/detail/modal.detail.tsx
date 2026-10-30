import Modal from "@/components/shared/modal.component";
import { ANILIST_DETAIL_WIDTH_CLASS } from "@/config/anilist/detail.config";
import { useCell } from "@/lib/core/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { AniDetailProps as DetailProps } from "@/types/anilist/anilist";

import { AnimeDetailShell } from "./shell.detail";

function AniListDetailModal(props: DetailProps) {
  const detailWidth = useCell(settingsAtoms.animeDetailWidth);
  return (
    <AnimeDetailShell
      {...props}
      render={({ title, actions, onBack, body }) => (
        <Modal
          header={title}
          onClose={props.onClose}
          onBack={onBack}
          headerActions={actions}
          className={ANILIST_DETAIL_WIDTH_CLASS[detailWidth]}
        >
          {body}
        </Modal>
      )}
    />
  );
}

export default AniListDetailModal;
