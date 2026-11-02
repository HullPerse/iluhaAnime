import { useEffect, useRef, useState } from "react";

import TrackDropdown from "@/routes/components/player/media/dropdown.tracks";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/promise.utils";
import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";
import { warmStreamUrl } from "@/lib/player/streamWarm.utils";
import { settingsAtoms } from "@/store/settings.store";
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
  const lastQualityRef = useRef<string>(session.quality);

  useEffect(() => {
    if (lastQualityRef.current === session.quality) return;
    lastQualityRef.current = session.quality;
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

  const warm = (label: string) => {
    const source = session.sources.find((entry) => entry.label === label);
    if (!source) return;
    ignore(
      warmStreamUrl(
        source.url,
        session.headers,
        playbackProxyUrl(session.variantId, settingsAtoms.animelibProxyUrl.get(), source.url)
      )
    );
  };

  return (
    <TrackDropdown
      label={t("player.stream.quality")}
      options={options}
      value={pending ?? session.quality}
      disabled={switching || options.length <= 1}
      onOptionHover={warm}
      onSelect={(label) => ignore(pick(label))}
    />
  );
}
