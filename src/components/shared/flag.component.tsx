import { cn } from "cn";

import {
  FLAG_CELLS,
  FLAG_CELL_HEIGHT,
  FLAG_CELL_WIDTH,
  FLAG_SHEET_HEIGHT,
  FLAG_SHEET_WIDTH,
  FLAG_SPRITE_PATH,
} from "@/lib/torrent/flags.generated";

export function FlagIcon({ code, className }: { code?: string | null; className?: string }) {
  const cell = code ? FLAG_CELLS[code.toLowerCase()] : undefined;
  if (!cell) {
    return (
      <span
        aria-hidden="true"
        className={cn("bg-surface inline-block shrink-0 opacity-60", className)}
        style={{ height: FLAG_CELL_HEIGHT, width: FLAG_CELL_WIDTH }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={code?.toUpperCase()}
      title={code?.toUpperCase()}
      className={cn("inline-block shrink-0", className)}
      style={{
        backgroundImage: `url(${FLAG_SPRITE_PATH})`,
        backgroundPosition: `-${cell[0]}px -${cell[1]}px`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${FLAG_SHEET_WIDTH}px ${FLAG_SHEET_HEIGHT}px`,
        height: FLAG_CELL_HEIGHT,
        width: FLAG_CELL_WIDTH,
      }}
    />
  );
}
