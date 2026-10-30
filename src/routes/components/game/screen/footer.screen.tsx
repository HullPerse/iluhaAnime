import { Maximize2, Minimize2, Square, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import Slider from "@/components/ui/range.component";
import { GAME_PLATFORM_LABELS } from "@/config/system/platforms.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { GameTelemetry } from "@/types/core/game";
import type { GameSessionRuntime } from "@/types/core/gameSession";

export function ScreenFooter({
  runtime,
  telemetry,
  muted,
  volume,
  cols,
  rows,
  expanded,
  onStop,
  onToggleMute,
  onVolumeChange,
  onToggleExpanded,
}: {
  runtime: GameSessionRuntime;
  telemetry: GameTelemetry;
  muted: boolean;
  volume: number;
  cols: number;
  rows: number;
  expanded: boolean;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleExpanded: () => void;
}) {
  const { t } = useI18n();
  const info = runtime.info;
  const running = runtime.status === "running";

  return (
    <footer className="windows95-border bg-surface flex items-center gap-2 px-1 py-0.5">
      <span className="windows95-text min-w-0 flex-1 truncate text-xs">
        {runtime.status === "starting"
          ? t("game.status.starting")
          : info !== null
            ? `${info.name} - ${t(GAME_PLATFORM_LABELS[info.platform])}`
            : t("game.status.idle")}
      </span>
      {running && telemetry.waitingKey && (
        <span className="text-highlight shrink-0 text-xs">{t("game.status.waiting")}</span>
      )}
      {running && telemetry.halted && (
        <span className="text-destructive shrink-0 text-xs">{t("game.status.halted")}</span>
      )}
      {running && (
        <span className="text-hint shrink-0 text-xs tabular-nums">
          {cols}×{rows}
        </span>
      )}
      {running && info !== null && (
        <span className="text-hint shrink-0 text-xs tabular-nums">{info.cyclesPerSecond} CPS</span>
      )}
      {running && (
        <span className="text-hint shrink-0 text-xs tabular-nums">
          {t("game.status.fps", { value: telemetry.fps })}
        </span>
      )}
      <div className="w-48 shrink-0">
        <Slider
          label={t("game.volume")}
          min={0}
          max={1}
          step={0.05}
          value={volume}
          suffix="%"
          onChange={onVolumeChange}
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        title={muted ? t("game.unmute") : t("game.mute")}
        aria-label={muted ? t("game.unmute") : t("game.mute")}
        onClick={onToggleMute}
      >
        {muted ? (
          <VolumeX aria-hidden className="size-3" />
        ) : (
          <Volume2 aria-hidden className="size-3" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        title={expanded ? t("game.fullscreen.exit") : t("game.fullscreen")}
        aria-label={expanded ? t("game.fullscreen.exit") : t("game.fullscreen")}
        onClick={onToggleExpanded}
      >
        {expanded ? (
          <Minimize2 aria-hidden className="size-3" />
        ) : (
          <Maximize2 aria-hidden className="size-3" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        title={t("game.stop")}
        aria-label={t("game.stop")}
        disabled={!running}
        onClick={onStop}
      >
        <Square aria-hidden className="size-3" />
      </Button>
    </footer>
  );
}
