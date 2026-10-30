import { cn } from "cn";
import { Activity, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { PlayerStream } from "@/hooks/player/stream.hook";
import { useCell } from "@/lib/state/signal.hook";
import { buildVariantId, isSubtitleVariant, variantOf } from "@/lib/stream/helpers";
import { loadSources } from "@/lib/stream/sessionCache.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { formatBytes, formatRate } from "@/lib/utils/bytes.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { formatClock } from "@/lib/utils/time.utils";
import { playbackAtoms } from "@/store/player.store";
import type { StreamVariant } from "@/types/stream";
import type { StreamOpen } from "@/types/videoPlayer";

import TrackDropdown, { type DropdownOption } from "./dropdown.tracks";

interface StreamControlProps {
  /** Hides the control while the player chrome is in a compact mode. */
  hidden?: boolean;
  /** The window owns the session so the context menu can switch the same one. */
  stream: PlayerStream;
}

function variantOptions(variants: StreamVariant[]): DropdownOption[] {
  return variants.map((variant) => ({
    value: buildVariantId(variant),
    main: variant.name,
    hint: variant.language || undefined,
  }));
}

/**
 * Voice-over and subtitle streams share one active row: picking one kind makes
 * the other read None, because only one of them can be playing.
 */
function StreamVariantSelects({
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

  useEffect(() => {
    setPending(null);
  }, [session.variantId]);

  const activeId = pending ?? session.variantId;
  const activeVoice = variantOf(voices, activeId);
  const activeSubtitle = variantOf(subtitles, activeId);

  // A Kodik row costs a player page and a POST on first use, so the pointer
  // moving over an option starts that resolve while the click is still ahead.
  const prefetch = (rows: StreamVariant[], id: string) => {
    const variant = variantOf(rows, id);
    if (!variant) return;
    ignore(attempt(loadSources(session.episodeId, buildVariantId(variant))));
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

/** Quality always comes from the resolved source list, never a fixed table. */
function StreamQualitySelect({
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-hint text-xs">{label}</span>
      <span className="text-text text-xs tabular-nums">{value}</span>
    </div>
  );
}

/** The stream's own numbers: source, buffer health and the video readout. */
function StreamStats({
  session,
  variants,
  onClose,
}: {
  session: StreamOpen;
  variants: StreamVariant[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const ahead = useCell(playbackAtoms.cacheDuration);
  const cached = useCell(playbackAtoms.cacheBytes);
  const speed = useCell(playbackAtoms.cacheSpeed);
  const buffering = useCell(playbackAtoms.cacheBufferingState);
  const pausedForCache = useCell(playbackAtoms.pausedForCache);
  const width = useCell(playbackAtoms.videoWidth);
  const height = useCell(playbackAtoms.videoHeight);
  const fps = useCell(playbackAtoms.fpsRender);
  const drops = useCell(playbackAtoms.dropCount);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (ref.current && target instanceof Node && !ref.current.contains(target)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const voice = variantOf(variants, session.variantId);
  const unknown = t("player.stream.stats.unknown");
  const resolution = width !== undefined && height !== undefined ? `${width}x${height}` : unknown;
  const frameRate = fps === undefined ? unknown : fps.toFixed(2);
  const dropped = drops === undefined ? unknown : String(drops);
  const fillRate = speed === undefined ? "" : formatRate(speed);

  return (
    <div
      ref={ref}
      className="windows95-border bg-primary absolute right-0 bottom-full z-50 flex w-60 flex-col p-1 select-none"
    >
      <div className="border-muted mb-1 flex items-baseline justify-between gap-1 border-b-2 pb-0.5">
        <span className="windows95-text min-w-0 truncate text-xs font-bold">
          {session.sourceName}
        </span>
        <span className="windows95-text bg-secondary shrink-0 px-1 text-xs text-white">
          {session.quality || "-"}
        </span>
      </div>

      {pausedForCache === true && buffering !== undefined ? (
        <div className="mb-1 flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between">
            <span className="text-hint text-xs">{t("player.stream.buffering")}</span>
            <span className="text-text text-xs tabular-nums">{Math.round(buffering)}%</span>
          </div>
          <ProgressBar
            value={buffering}
            max={100}
            className="h-2"
            ariaLabel={t("player.stream.buffering")}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <StatRow
          label={t("player.stream.voice")}
          value={voice?.name ?? t("player.media.tracks.none")}
        />
      </div>

      <div className="border-muted mt-1 flex flex-col gap-0.5 border-t-2 pt-1">
        <StatRow
          label={t("player.stream.buffer.ahead")}
          value={ahead === undefined ? "-" : formatClock(ahead)}
        />
        <StatRow
          label={t("player.stream.buffer.cached")}
          value={cached === undefined ? "-" : formatBytes(cached)}
        />
        <StatRow label={t("player.stream.buffer.speed")} value={fillRate || "-"} />
      </div>

      <div className="border-muted mt-1 flex flex-col gap-0.5 border-t-2 pt-1">
        <StatRow label={t("player.stream.stats.resolution")} value={resolution} />
        <StatRow label={t("player.stream.stats.fps")} value={frameRate} />
        <StatRow label={t("player.stream.stats.dropped")} value={dropped} />
      </div>
    </div>
  );
}

/**
 * The streaming choices live in the same select row as the player tracks: a
 * voice-over, a subtitle stream and a quality, with the buffer numbers behind a
 * separate stats button instead of an open panel. The session comes from the
 * window, which also offers these choices in the video context menu.
 */
export default function StreamControl({ hidden, stream }: StreamControlProps) {
  const { t } = useI18n();
  const pausedForCache = useCell(playbackAtoms.pausedForCache);
  const cacheBuffering = useCell(playbackAtoms.cacheBufferingState);
  const [statsOpen, setStatsOpen] = useState(false);
  const session = stream.session;

  if (hidden === true || !session) return null;

  const voices = stream.variants.filter((variant) => !isSubtitleVariant(variant));
  const subtitles = stream.variants.filter(isSubtitleVariant);
  const busy = stream.switching || stream.variantsLoading || stream.variantsFailed;
  // One line for both transient states, in a slot that is always rendered. A
  // status that comes and goes in flow moved the selects beside it on every
  // buffering blip; the width is reserved so the row stays put.
  const status = stream.switching
    ? t("player.stream.switching")
    : pausedForCache === true
      ? `${t("player.stream.buffering")}${cacheBuffering === undefined ? "" : ` ${Math.round(cacheBuffering)}%`}`
      : "";

  return (
    <section className="border-muted relative flex h-6 items-center gap-1 border-r-2 px-1">
      {statsOpen ? (
        <StreamStats
          session={session}
          variants={stream.variants}
          onClose={() => setStatsOpen(false)}
        />
      ) : null}

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

      {stream.variantsFailed ? (
        <Button
          size="icon"
          className="size-6"
          title={`${t("player.stream.voice.failed")} - ${t("player.stream.retry")}`}
          aria-label={t("player.stream.retry")}
          onClick={() => stream.reloadVariants()}
        >
          <RefreshCw className="size-3" />
        </Button>
      ) : null}

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
