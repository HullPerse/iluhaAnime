import { useI18n } from "@/lib/locale/i18n.utils";
import type { MpvTrack } from "@/types/videoPlayer";

import TrackDropdown from "./dropdown.tracks";

export function trackLabel(track: MpvTrack): string {
  const parts: string[] = [];
  if (track.title) {
    parts.push(track.title);
  } else if (track.lang) {
    parts.push(track.lang);
  }
  if (track.codec) {
    parts.push(track.codec.toUpperCase());
  }
  if (track.type === "audio" && track["demux-channels"]) {
    parts.push(track["demux-channels"]);
  }
  return parts.length > 0 ? parts.join(" · ") : `#${track.id}`;
}

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
  const audio = tracks.filter((track) => track.type === "audio");
  const subs = tracks.filter((track) => track.type === "sub");
  const selectedAudio = audio.find((track) => track.selected)?.id ?? null;
  const selectedSub = subs.find((track) => track.selected)?.id ?? null;

  return (
    <section className="flex h-6 items-center gap-1 px-1">
      <TrackDropdown
        label={t("player.media.tracks.audio")}
        tracks={audio.map((track) => ({ id: track.id, label: trackLabel(track) }))}
        selectedId={selectedAudio}
        onSelect={onSelectAudio}
        onAdd={onAddAudio}
        addLabel={t("player.media.tracks.add.audio")}
      />
      <TrackDropdown
        label={t("player.media.tracks.subs.short")}
        tracks={subs.map((track) => ({ id: track.id, label: trackLabel(track) }))}
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