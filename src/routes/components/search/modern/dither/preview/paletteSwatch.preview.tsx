import { cn } from "cn";
import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { hexToRgba, rgbToHex } from "@/lib/utils/color.utils";
import type { DitherRGB } from "@/types/dither";

export function PaletteSwatchStrip({
  palette,
  onChange,
}: {
  palette: DitherRGB[];
  onChange: (palette: DitherRGB[]) => void;
}) {
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const patch = (index: number, hex: string) => {
    const rgba = hexToRgba(hex);
    if (!rgba) return;
    const next = [...palette];
    next[index] = [rgba.r, rgba.g, rgba.b];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="border-secondary flex h-6 w-full flex-row border">
        {palette.map((color, index) => (
          <button
            type="button"
            key={`${index}-${rgbToHex(color)}`}
            className={cn(
              "h-full flex-1 cursor-pointer",
              editIndex === index && "outline-2 outline-offset-1"
            )}
            style={{ background: rgbToHex(color) }}
            title={rgbToHex(color).toUpperCase()}
            aria-label={`#${rgbToHex(color)}`}
            onClick={() => setEditIndex(index === editIndex ? null : index)}
          />
        ))}
      </div>
      {editIndex !== null && palette[editIndex] !== undefined && (
        <div className="flex items-center gap-1">
          <ColorPickerTrigger
            value={rgbToHex(palette[editIndex])}
            onChange={(hex) => patch(editIndex, hex)}
          />
          <span className="windows95-text flex-1 truncate text-xs">
            {rgbToHex(palette[editIndex]).toUpperCase()}
          </span>
          <Button
            size="icon"
            className="h-4 w-4"
            title="x"
            disabled={palette.length <= 2}
            onClick={() => {
              onChange(palette.filter((_, i) => i !== editIndex));
              setEditIndex(null);
            }}
          >
            <X className="size-2.5" />
          </Button>
          <Button
            className="h-4 px-1 text-xs"
            title="+"
            onClick={() => {
              const copy = [...palette];
              copy.splice(editIndex + 1, 0, palette[editIndex]);
              onChange(copy);
              setEditIndex(editIndex + 1);
            }}
          >
            +
          </Button>
        </div>
      )}
    </div>
  );
}
