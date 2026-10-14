import Slider from "@/components/ui/range.component";
import {
  DITHER_SLIDER_DEFS,
  DITHER_SLIDER_GROUPS,
  DITHER_SLIDER_LABELS,
} from "@/config/utils/dither.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { DitherEffectOptions, DitherSliderField } from "@/types/dither";

const SLIDER_BY_FIELD: Record<DitherSliderField, { min: number; max: number; step: number }> =
  DITHER_SLIDER_DEFS.reduce(
    (acc, def) => {
      acc[def.field] = def;
      return acc;
    },
    {} as Record<DitherSliderField, { min: number; max: number; step: number }>
  );

function isSliderActive(field: DitherSliderField, options: DitherEffectOptions): boolean {
  if (field === "paletteMix") return options.mode === "ordered" && options.palette.length > 0;
  if (field === "levels") return options.mode === "ordered" || options.palette.length === 0;
  if (field === "dotSize" || field === "dotSoftness") return options.halftone > 0;
  if (field === "glyphSize") return options.glyphs > 0;
  return true;
}

export default function DitherControls({
  options,
  onPatch,
}: {
  options: DitherEffectOptions;
  onPatch: (partial: Partial<DitherEffectOptions>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      {DITHER_SLIDER_GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-1">
          <h3 className="windows95-text text-xs font-bold">{t(group.title)}</h3>
          {group.fields.map((field) => {
            const def = SLIDER_BY_FIELD[field];
            return (
              <Slider
                key={field}
                label={t(DITHER_SLIDER_LABELS[field])}
                min={def.min}
                max={def.max}
                step={def.step}
                value={options[field]}
                disabled={!isSliderActive(field, options)}
                onChange={(value) => onPatch({ [field]: value })}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
