import { Info, Maximize2, Minimize2, Square, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import type { RefObject } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import Slider from "@/components/ui/range.component";
import { GAME_DISPLAY } from "@/config/game/display.config";
import { GAME_PLATFORM_LABELS } from "@/config/game/platforms.config";
import type { GameSessionRuntime, GameSessionStatus } from "@/hooks/game/session.hook";
import { useI18n } from "@/hooks/i18n.hook";
import GameKeypad from "@/routes/components/game/keypad.game";
import type { GameTelemetry } from "@/types/game";

export interface GameScreenProps {
  runtime: GameSessionRuntime;
  telemetry: GameTelemetry;
  /** Keys held right now, from physical presses and keypad clicks. */
  pressedKeys: ReadonlySet<number>;
  muted: boolean;
  volume: number;
  cols: number;
  rows: number;
  scale: number;
  expanded: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onPressKey: (key: number, pressed: boolean) => void;
  onRetry: () => void;
  onToggleExpanded: () => void;
}

/** Idle / starting / error content shown over the empty stage. */
function StageOverlay({
  status,
  error,
  onRetry,
}: {
  status: GameSessionStatus;
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  if (status === "running") return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
      {status === "starting" && (
        <>
          <SmallLoader size={8} />
          <span className="text-hint text-xs">{t("game.status.starting")}</span>
        </>
      )}
      {status === "error" && (
        <>
          <TriangleAlert aria-hidden className="text-destructive size-8" />
          <span className="text-destructive text-xs font-bold">{t("game.stage.error")}</span>
          {error !== null && <span className="text-hint max-w-md text-xs">{error}</span>}
          <Button className="pointer-events-auto" onClick={onRetry}>
            {t("game.retry")}
          </Button>
        </>
      )}
    </div>
  );
}

function ScreenFooter({
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
            ? `${info.name} · ${t(GAME_PLATFORM_LABELS[info.platform])}`
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

export default function GameScreen({
  runtime,
  telemetry,
  pressedKeys,
  muted,
  volume,
  cols,
  rows,
  scale,
  expanded,
  stageRef,
  canvasRef,
  onStop,
  onToggleMute,
  onVolumeChange,
  onPressKey,
  onRetry,
  onToggleExpanded,
}: GameScreenProps) {
  const { t } = useI18n();
  const info = runtime.info;
  const running = runtime.status === "running";

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
      <div className="windows95-border bg-surface flex min-h-0 flex-1 p-1">
        <div
          ref={stageRef}
          className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
          style={{ backgroundColor: GAME_DISPLAY.background }}
        >
          <canvas
            ref={canvasRef}
            width={cols}
            height={rows}
            className="block"
            style={{ width: cols * scale, height: rows * scale, imageRendering: "pixelated" }}
          />
          <StageOverlay status={runtime.status} error={runtime.error} onRetry={onRetry} />
        </div>
      </div>
      <ScreenFooter
        runtime={runtime}
        telemetry={telemetry}
        muted={muted}
        volume={volume}
        cols={cols}
        rows={rows}
        expanded={expanded}
        onStop={onStop}
        onToggleMute={onToggleMute}
        onVolumeChange={onVolumeChange}
        onToggleExpanded={onToggleExpanded}
      />
      {!expanded && info !== null && info.howto !== null && (
        <div
          className="windows95-border bg-surface text-hint flex shrink-0 items-center gap-1 px-1 py-0.5 text-xs"
          title={info.howto}
        >
          <Info aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{t("game.controls", { hint: info.howto })}</span>
        </div>
      )}
      <GameKeypad pressedKeys={pressedKeys} enabled={running} onPress={onPressKey} />
    </section>
  );
}
