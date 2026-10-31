import { cn } from "cn";
import { Activity, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { PlayerStream } from "@/types/player/playerStream";
import { useCell } from "@/lib/core/signal.hook";
import { isSubtitleVariant } from "@/lib/player/streamHelpers.utils";
import { playbackAtoms } from "@/store/player.store";

import { StreamVariantSelects } from "@/routes/components/player/media/streamVariantSelects.player";
import { StreamQualitySelect } from "@/routes/components/player/media/streamQualitySelect.player";
import { StreamStats } from "@/routes/components/player/media/streamStats.player";

interface StreamControlProps {
  hidden?: boolean;
  stream: PlayerStream;
}

export default function StreamControl({ hidden, stream }: StreamControlProps) {
  const { t } = useI18n();
  const pausedForCache = useCell(playbackAtoms.pausedForCache);
  const [statsOpen, setStatsOpen] = useState<boolean>(false);
  const session = stream.session;

  if (hidden === true || !session) return null;

  const voices = stream.variants.filter((variant) => !isSubtitleVariant(variant));
  const subtitles = stream.variants.filter(isSubtitleVariant);
  const busy = stream.switching || stream.variantsLoading || stream.variantsFailed;
  let status = "";
  if (stream.switching) status = t("player.stream.switching");
  else if (pausedForCache === true) status = t("player.stream.buffering");

  return (
    <section className="border-muted relative flex h-6 items-center gap-1 border-r-2 px-1">
      {statsOpen && (
        <StreamStats
          session={session}
          variants={stream.variants}
          onClose={() => setStatsOpen(false)}
        />
      )}

      <StreamVariantSelects
        session={session}
        voices={voices}
        subtitles={subtitles}
        disabled={busy}
        switchVariant={stream.switchVariant}
      />
      <StreamQualitySelect
        session={session}
        switching={stream.switching}
        switchQuality={stream.switchQuality}
      />

      <Button
        size="icon"
        className={cn("size-6", statsOpen && "bg-secondary text-white")}
        title={t("player.stream.stats")}
        aria-label={t("player.stream.stats")}
        aria-expanded={statsOpen}
        onClick={() => setStatsOpen(!statsOpen)}
      >
        <Activity className="size-4" />
      </Button>

      {stream.variantsFailed && (
        <Button
          size="icon"
          className="size-6"
          title={`${t("player.stream.voice.failed")} - ${t("player.stream.retry")}`}
          aria-label={t("player.stream.retry")}
          onClick={() => stream.reloadVariants()}
        >
          <RefreshCw className="size-3" />
        </Button>
      )}

      <span
        data-testid="stream-status"
        className="text-hint w-24 shrink-0 truncate text-xs whitespace-nowrap"
        aria-live="polite"
      >
        {status}
      </span>
    </section>
  );
}
