import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { DITHER_PALETTE_PRESETS, DITHER_PALETTE_PRESET_LABELS } from "@/config/utils/dither.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { rgbToHex } from "@/lib/utils/color.utils";
import { palettesEqual } from "@/lib/utils/dither.utils";
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
    <div className="flex flex-row gap-1">
      {DITHER_PALETTE_PRESETS.map((preset) => (
        <Button
          type="button"
          key={preset.id}
          title={t(DITHER_PALETTE_PRESET_LABELS[preset.id])}
          onClick={() => onPick([...preset.colors])}
          className={cn(
            "flex w-26 flex-col p-0.5",
            palettesEqual(active, preset.colors) ? "windows95-active-border" : "windows95-border"
          )}
          disabled={palettesEqual(active, preset.colors)}
        >
          <span className="flex h-4 w-full flex-row">
            {preset.colors.map((color, i) => (
              <span
                key={`${i}-${rgbToHex(color)}`}
                className="h-full flex-1"
                style={{ backgroundColor: rgbToHex(color) }}
              />
            ))}
          </span>
          <span className="windows95-text block truncate text-xs">
            {t(DITHER_PALETTE_PRESET_LABELS[preset.id])}
          </span>
        </Button>
      ))}
    </div>
  );
}
