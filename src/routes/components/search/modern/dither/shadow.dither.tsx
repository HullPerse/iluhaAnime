import { Checkbox } from "@/components/ui/checkbox.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import Slider from "@/components/ui/range.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/types/i18n";
import type { WallpaperShadow, WallpaperShadowSides } from "@/types/settings";

const SHADOW_SIDE_KEYS: readonly (keyof WallpaperShadowSides)[] = [
  "top",
  "right",
  "bottom",
  "left",
];

export function ShadowControls({
  heading,
  value,
  onPatch,
  showLength = true,
}: {
  heading: string;
  value: WallpaperShadow;
  onPatch: (partial: Partial<WallpaperShadow>) => void;
  showLength?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <h3 className="windows95-text text-xs font-bold">{heading}</h3>
      <div className="flex flex-row gap-2">
        {SHADOW_SIDE_KEYS.map((side) => (
          <label key={side} className="flex cursor-pointer flex-row items-center gap-1">
            <Checkbox
              checked={value.sides[side]}
              onChange={(checked) => onPatch({ sides: { ...value.sides, [side]: checked } })}
            />
            <span className="windows95-text text-xs">
              {t(`search.dither.display.shadow.${side}` as TranslationKey)}
            </span>
          </label>
        ))}
      </div>
      {showLength && (
        <Slider
          label={t("search.dither.display.shadow.length")}
          min={0}
          max={100}
          step={1}
          suffix="px"
          value={value.length}
          onChange={(length) => onPatch({ length })}
        />
      )}
      <Slider
        label={t("search.dither.display.shadow.softness")}
        min={0}
        max={100}
        step={1}
        suffix="px"
        value={value.softness}
        onChange={(softness) => onPatch({ softness })}
      />
      <Slider
        label={t("search.dither.display.shadow.intensity")}
        min={0}
        max={100}
        step={5}
        value={value.intensity}
        onChange={(intensity) => onPatch({ intensity })}
      />
      <div className="flex flex-row items-center gap-1">
        <span className="windows95-text text-xs">{t("search.dither.display.shadow.color")}</span>
        <ColorPickerTrigger value={value.color} onChange={(color) => onPatch({ color })} />
      </div>
    </>
  );
}
