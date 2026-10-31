import { useI18n } from "@/hooks/i18n.hook";
import type {
  EndOfFileMode,
  HwdecMode,
  PlayerProfileId,
  PlayerSettings,
  SeekMode,
} from "@/types/player/videoPlayer";

import Cheatsheet from "@/routes/components/player/media/cheatsheet.player";
import PlayerModal from "@/routes/components/player/media/modal.player";
import SettingsPanel from "@/routes/components/player/media/settings.player";

export function PlayerPanel({
  panel,
  settings,
  hwdec,
  seekMode,
  eofMode,
  autoHide,
  profile,
  streaming,
  onClose,
  onPatchSettings,
  onHwdec,
  onSeekMode,
  onEofMode,
  onAutoHide,
  onProfile,
}: {
  panel: null | "settings" | "cheatsheet";
  settings: PlayerSettings;
  hwdec: HwdecMode;
  seekMode: SeekMode;
  eofMode: EndOfFileMode;
  autoHide: boolean;
  profile: PlayerProfileId;
  streaming: boolean;
  onClose: () => void;
  onPatchSettings: (patch: Partial<PlayerSettings>) => void;
  onHwdec: (mode: HwdecMode) => void;
  onSeekMode: (mode: SeekMode) => void;
  onEofMode: (mode: EndOfFileMode) => void;
  onAutoHide: (value: boolean) => void;
  onProfile: (next: PlayerProfileId) => void;
}) {
  const { t } = useI18n();
  if (panel === null) return null;
  return (
    <PlayerModal
      header={t(
        panel === "settings" ? "player.media.panel.settings" : "player.media.panel.cheatsheet"
      )}
      className="w-xl"
      onClose={onClose}
    >
      {panel === "settings" ? (
        <SettingsPanel
          settings={settings}
          hwdec={hwdec}
          seekMode={seekMode}
          eofMode={eofMode}
          autoHide={autoHide}
          profile={profile}
          streaming={streaming}
          onPatchSettings={onPatchSettings}
          onHwdec={onHwdec}
          onSeekMode={onSeekMode}
          onEofMode={onEofMode}
          onAutoHide={onAutoHide}
          onProfile={onProfile}
        />
      ) : (
        <Cheatsheet />
      )}
    </PlayerModal>
  );
}
