import { Square, Volume2, VolumeX } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button.component";
import { GAME_DISPLAY } from "@/config/game/display.config";
import { GAME_KEYPAD_ROWS } from "@/config/game/keypad.config";
import { GAME_PLATFORM_LABELS } from "@/config/game/platforms.config";
import type { GameSessionRuntime } from "@/hooks/game/session.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { GameTelemetry } from "@/types/game";

export interface GameScreenProps {
  runtime: GameSessionRuntime;
  telemetry: GameTelemetry;
  muted: boolean;
  cols: number;
  rows: number;
  scale: number;
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onStop: () => void;
  onToggleMute: () => void;
}

export default function GameScreen({
  runtime,
  telemetry,
  muted,
  cols,
  rows,
  scale,
  stageRef,
  canvasRef,
  onStop,
  onToggleMute,
}: GameScreenProps) {
  const { t } = useI18n();
  const info = runtime.info;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
      <div className="windows95-border bg-surface flex min-h-0 flex-1 p-1">
        <div
          ref={stageRef}
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
          style={{ backgroundColor: GAME_DISPLAY.background }}
        >
          <canvas
            ref={canvasRef}
            width={cols}
            height={rows}
            className="block"
            style={{ width: cols * scale, height: rows * scale, imageRendering: "pixelated" }}
          />
        </div>
      </div>
      <footer className="windows95-border bg-surface flex items-center gap-2 px-1 py-0.5">
        <span className="windows95-text truncate text-xs">
          {runtime.status === "starting"
            ? t("game.status.starting")
            : info
              ? `${info.name} · ${t(GAME_PLATFORM_LABELS[info.platform])}`
              : t("game.status.idle")}
        </span>
        {runtime.status === "error" && runtime.error !== null && (
          <span className="text-destructive truncate text-xs">
            {t("game.status.error", { error: runtime.error })}
          </span>
        )}
        {runtime.status === "running" && telemetry.waitingKey && (
          <span className="text-highlight text-xs">{t("game.status.waiting")}</span>
        )}
        {runtime.status === "running" && telemetry.halted && (
          <span className="text-destructive text-xs">{t("game.status.halted")}</span>
        )}
        <span className="text-hint ml-auto shrink-0 text-xs">
          {runtime.status === "running" ? t("game.status.fps", { value: telemetry.fps }) : ""}
        </span>
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
          title={t("game.stop")}
          aria-label={t("game.stop")}
          disabled={runtime.status !== "running"}
          onClick={onStop}
        >
          <Square aria-hidden className="size-3" />
        </Button>
      </footer>
      {info !== null && info.howto !== null && (
        <div
          className="windows95-border bg-surface text-hint shrink-0 truncate px-1 py-0.5 text-xs"
          title={info.howto}
        >
          {t("game.controls", { hint: info.howto })}
        </div>
      )}
      <div className="windows95-border bg-surface flex shrink-0 items-center justify-center p-1">
        <div className="flex flex-col gap-0.5">
          {GAME_KEYPAD_ROWS.map((row) => (
            <div key={row[0].code} className="flex gap-0.5">
              {row.map((entry) => (
                <span
                  key={entry.code}
                  className="windows95-active-border bg-field flex h-8 w-9 flex-col items-center justify-center"
                  title={entry.key.toString(16).toUpperCase()}
                >
                  <span className="windows95-text text-xs leading-none font-bold">
                    {entry.label}
                  </span>
                  <span className="text-hint text-xs leading-none">
                    {entry.key.toString(16).toUpperCase()}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
