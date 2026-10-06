import { useI18n } from "@/hooks/i18n.hook";
import { sortTracksByLanguage, toTrackDisplay, trackLabel } from "@/lib/player/tracks.utils";
import type { MpvTrack } from "@/types/videoPlayer";

import TrackDropdown from "./dropdown.tracks";

export { trackLabel };

function Tracks({
  tracks,
  onSelectAudio,
  onSelectSub,
  onAddAudio,
  onAddSubtitle,
}: {
  tracks: MpvTrack[];
  onSelectAudio: (id: number | "no") => void;
  onSelectSub: (id: number | "no") => void;
  onAddAudio: () => void;
  onAddSubtitle: () => void;
}) {
  const { t } = useI18n();
  const audio = sortTracksByLanguage(tracks.filter((track) => track.type === "audio"));
  const subs = sortTracksByLanguage(tracks.filter((track) => track.type === "sub"));
  const selectedAudio = audio.find((track) => track.selected)?.id ?? null;
  const selectedSub = subs.find((track) => track.selected)?.id ?? null;

  return (
    <section className="flex h-6 items-center gap-1 px-1">
      <TrackDropdown
        label={t("player.media.tracks.audio")}
        tracks={audio.map((track) => ({ ...toTrackDisplay(track) }))}
        selectedId={selectedAudio}
        onSelect={onSelectAudio}
        onAdd={onAddAudio}
        addLabel={t("player.media.tracks.add.audio")}
      />
      <TrackDropdown
        label={t("player.media.tracks.subs.short")}
        tracks={subs.map((track) => ({ ...toTrackDisplay(track) }))}
        selectedId={selectedSub}
        noneLabel={t("player.media.tracks.none")}
        onSelect={onSelectSub}
        onAdd={onAddSubtitle}
        addLabel={t("player.media.tracks.add.subtitle")}
      />
    </section>
  );
}

export default Tracks;
