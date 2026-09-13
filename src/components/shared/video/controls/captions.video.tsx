import type { TextTrackLike } from "@videojs/media";
import { useEffect, useState } from "react";

import Select from "@/components/ui/select.component";
import { CAPTIONS_OFF } from "@/config/player/video.config";
import { useCaptionTracks } from "@/hooks/videoCaptions.hook";
import { useI18n } from "@/lib/locale/i18n.utils";

export function CaptionsSelect() {
  const { t } = useI18n();
  const { tracks, showingId } = useCaptionTracks();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(showingId);
  }, [showingId]);
  if (tracks.length === 0) return null;

  const trackValue = (track: TextTrackLike) => track.id || track.language;
  const options: { value: string; label: string }[] = [
    { value: CAPTIONS_OFF, label: t("player.video.captions.off") },
    ...tracks.map((track) => ({
      value: trackValue(track),
      label: track.label || track.language.toUpperCase(),
    })),
  ];
  const current =
    selected && options.some((option) => option.value === selected) ? selected : CAPTIONS_OFF;

  const select = (value: string) => {
    for (const track of tracks) {
      track.mode = trackValue(track) === value && value !== CAPTIONS_OFF ? "showing" : "disabled";
    }
    setSelected(value);
  };

  return (
    <Select
      label={t("player.video.captions")}
      value={current}
      onChange={select}
      options={options}
      className="h-4 min-h-4 w-16"
    />
  );
}
