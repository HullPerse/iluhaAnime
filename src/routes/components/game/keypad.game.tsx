import { cn } from "cn";

import { GAME_KEYPAD_ROWS } from "@/config/settings/keypad.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { GameKeypadProps } from "@/types/core/keypad.game";

/**
 * Classic 4x4 hex keypad. The caps mirror the live key state and act as a
 * pointer path into the shared key pipeline; keyboard users press the
 * physical mapped keys directly, so the caps are not tab stops.
 */
export default function GameKeypad({ pressedKeys, enabled, onPress }: GameKeypadProps) {
  const { t } = useI18n();

  return (
    <div
      className="windows95-border bg-surface flex shrink-0 items-center justify-center p-1"
      role="group"
      aria-label={t("game.keypad")}
    >
      <div className="flex flex-col gap-0.5">
        {GAME_KEYPAD_ROWS.map((row) => (
          <div key={row[0].code} className="flex gap-0.5">
            {row.map((entry) => {
              const pressed = pressedKeys.has(entry.key);
              return (
                <button
                  key={entry.code}
                  type="button"
                  tabIndex={-1}
                  data-pressed={pressed || undefined}
                  title={entry.key.toString(16).toUpperCase()}
                  className={cn(
                    "flex h-8 w-9 flex-col items-center justify-center",
                    pressed
                      ? "windows95-active-border bg-field"
                      : "windows95-small-border bg-surface"
                  )}
                  onPointerDown={enabled ? () => onPress(entry.key, true) : undefined}
                  onPointerUp={enabled ? () => onPress(entry.key, false) : undefined}
                  onPointerLeave={enabled ? () => onPress(entry.key, false) : undefined}
                  onPointerCancel={enabled ? () => onPress(entry.key, false) : undefined}
                >
                  <span
                    className={cn(
                      "windows95-text text-xs leading-none font-bold",
                      pressed && "text-highlight"
                    )}
                  >
                    {entry.label}
                  </span>
                  <span className="text-hint text-xs leading-none">
                    {entry.key.toString(16).toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
