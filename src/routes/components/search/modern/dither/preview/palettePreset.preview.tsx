import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { DITHER_PALETTE_PRESETS, DITHER_PALETTE_PRESET_LABELS } from "@/config/dither.config";
import { useI18n } from "@/hooks/i18n.hook";
import { rgbToHex } from "@/lib/color.utils";
import { palettesEqual } from "@/lib/dither.utils";
import type { DitherRGB } from "@/types/dither";

export function PalettePresetStrip({
  active,
  onPick,
}: {
  active: DitherRGB[];
  onPick: (palette: DitherRGB[]) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-row flex-wrap gap-1">
      {DITHER_PALETTE_PRESETS.map((preset) => (
        <Button
          type="button"
          key={preset.id}
          title={t(DITHER_PALETTE_PRESET_LABELS[preset.id])}
          onClick={() => onPick([...preset.colors])}
          className={cn(
            "flex w-26 max-w-full flex-col p-0.5",
            palettesEqual(active, preset.colors) ? "windows95-active-border" : "windows95-border"
          )}
          disabled={palettesEqual(active, preset.colors)}
        >
          <span className="flex h-4 w-full flex-row">
            {preset.colors.length === 0 ? (
              <span
                className="h-full w-full"
                style={{
                  background:
                    "linear-gradient(90deg, #2b2b2b, #e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6, #ecf0f1)",
                }}
              />
            ) : (
              preset.colors.map((color, i) => (
                <span
                  key={`${i}-${rgbToHex(color)}`}
                  className="h-full flex-1"
                  style={{ backgroundColor: rgbToHex(color) }}
                />
              ))
            )}
          </span>
          <span className="windows95-text block truncate text-xs">
            {t(DITHER_PALETTE_PRESET_LABELS[preset.id])}
          </span>
        </Button>
      ))}
    </div>
  );
}
