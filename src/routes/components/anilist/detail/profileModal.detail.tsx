import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist/anilistUi";

import { OverlayScreens } from "@/routes/components/anilist/detail/screens.detail";

export default function AniListProfileModal({
  initialScreen,
  onOpenAnime,
  onClose,
}: {
  initialScreen: AniListOverlayScreen;
  onOpenAnime: (id: number) => void;
  onClose: () => void;
}) {
  const [screens, setScreens] = useState<AniListOverlayScreen[]>([initialScreen]);
  const top = screens.at(-1) ?? initialScreen;
  const push = (screen: AniListOverlayScreen) => setScreens((prev) => [...prev, screen]);
  const back = () => setScreens((prev) => prev.slice(0, -1));
  const context: AniListOverlayContext = {
    isLoggedIn: false,
    onOpenAnime,
    onPush: push,
  };

  return (
    <Modal
      header={top.name}
      onClose={onClose}
      onBack={screens.length > 1 ? back : undefined}
      className="w-2xl"
    >
      <OverlayScreens current={top} context={context} />
    </Modal>
  );
}
