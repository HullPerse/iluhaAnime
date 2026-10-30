import { useI18n } from "@/hooks/i18n.hook";
import { sortTracksByLanguage, trackOptions, trackLabel } from "@/lib/torrent/tracks.utils";
import type { MpvTrack } from "@/types/player/videoPlayer";

import TrackDropdown from "@/routes/components/player/media/dropdown.tracks";

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
        options={trackOptions(audio)}
        value={selectedAudio === null ? null : String(selectedAudio)}
        onSelect={(id) => onSelectAudio(id === "no" ? "no" : Number(id))}
        onAdd={onAddAudio}
        addLabel={t("player.media.tracks.add.audio")}
      />
      <TrackDropdown
        label={t("player.media.tracks.subs.short")}
        options={trackOptions(subs)}
        value={selectedSub === null ? null : String(selectedSub)}
        noneLabel={t("player.media.tracks.none")}
        allowNone
        onSelect={(id) => onSelectSub(id === "no" ? "no" : Number(id))}
        onAdd={onAddSubtitle}
        addLabel={t("player.media.tracks.add.subtitle")}
      />
    </section>
  );
}

export default Tracks;
