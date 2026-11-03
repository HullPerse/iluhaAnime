import { useEffect, useRef, useState } from "react";

import TrackDropdown from "@/routes/components/player/media/dropdown.tracks";
import { useI18n } from "@/hooks/i18n.hook";
import { variantOptions } from "@/lib/player/streamVariant.utils";
import { buildVariantId, variantOf } from "@/lib/player/streamHelpers.utils";
import { loadSources } from "@/lib/core/sessionCache.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/promise.utils";
import { pickSource } from "@/lib/search/sources.utils";
import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";
import { warmStreamUrl } from "@/lib/player/streamWarm.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { StreamVariant } from "@/types/player/stream";
import type { StreamOpen } from "@/types/player/videoPlayer";
import type { PlayerStream } from "@/types/player/playerStream";

export function StreamVariantSelects({
  session,
  voices,
  subtitles,
  disabled,
  switchVariant,
}: {
  session: StreamOpen;
  voices: StreamVariant[];
  subtitles: StreamVariant[];
  disabled: boolean;
  switchVariant: PlayerStream["switchVariant"];
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);
  const lastVariantRef = useRef<string>(session.variantId);

  useEffect(() => {
    if (lastVariantRef.current === session.variantId) return;
    lastVariantRef.current = session.variantId;
    setPending(null);
  }, [session.variantId]);

  const activeId = pending ?? session.variantId;
  const activeVoice = variantOf(voices, activeId);
  const activeSubtitle = variantOf(subtitles, activeId);

  const prefetch = (rows: StreamVariant[], id: string) => {
    const variant = variantOf(rows, id);
    if (!variant) return;
    const variantId = buildVariantId(variant);
    ignore(
      attempt(loadSources(session.episodeId, variantId)).then(([sources]) => {
        if (!sources) return undefined;
        const source = pickSource(sources, session.quality);
        if (!source) return undefined;
        return warmStreamUrl(
          source.url,
          source.headers,
          playbackProxyUrl(
            source.variantId || variantId,
            settingsAtoms.animelibProxyUrl.get(),
            source.url
          )
        );
      })
    );
  };

  const pick = async (variant: StreamVariant) => {
    const id = buildVariantId(variant);
    if (id === session.variantId) return;
    setPending(id);
    const opened = await switchVariant(variant);
    if (!opened) setPending(null);
  };

  return (
    <>
      <TrackDropdown
        label={t("player.stream.voice")}
        options={variantOptions(voices)}
        value={activeVoice ? buildVariantId(activeVoice) : null}
        noneLabel={t("player.media.tracks.none")}
        disabled={disabled}
        onOptionHover={(id) => prefetch(voices, id)}
        onSelect={(id) => {
          const variant = variantOf(voices, id);
          if (variant) ignore(pick(variant));
        }}
      />
      <TrackDropdown
        label={t("player.media.tracks.subs.short")}
        options={variantOptions(subtitles)}
        value={activeSubtitle ? buildVariantId(activeSubtitle) : null}
        noneLabel={t("player.media.tracks.none")}
        disabled={disabled}
        onOptionHover={(id) => prefetch(subtitles, id)}
        onSelect={(id) => {
          const variant = variantOf(subtitles, id);
          if (variant) ignore(pick(variant));
        }}
      />
    </>
  );
}
