import { useEffect, useState } from "react";

import TrackDropdown from "@/routes/components/player/media/dropdown.tracks";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/promise.utils";
import type { StreamOpen } from "@/types/player/videoPlayer";
import type { PlayerStream } from "@/types/player/playerStream";

export function StreamQualitySelect({
  session,
  switching,
  switchQuality,
}: {
  session: StreamOpen;
  switching: boolean;
  switchQuality: PlayerStream["switchQuality"];
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    setPending(null);
  }, [session.quality]);

  const options = session.sources.map((source) => ({
    value: source.label,
    main: source.label,
  }));

  const pick = async (label: string) => {
    if (label === session.quality) return;
    setPending(label);
    const opened = await switchQuality(label);
    if (!opened) setPending(null);
  };

  return (
    <TrackDropdown
      label={t("player.stream.quality")}
      options={options}
      value={pending ?? session.quality}
      disabled={switching || options.length <= 1}
      onSelect={(label) => ignore(pick(label))}
    />
  );
}
