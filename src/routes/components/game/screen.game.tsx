import { Info } from "lucide-react";

import { GAME_DISPLAY } from "@/config/player/display.config";
import { useI18n } from "@/hooks/i18n.hook";
import GameKeypad from "@/routes/components/game/keypad.game";
import type { GameScreenProps } from "@/types/core/screen.game";

import { ScreenFooter } from "@/routes/components/game/screen/footer.screen";
import { StageOverlay } from "@/routes/components/game/screen/stageOverlay.screen";

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
