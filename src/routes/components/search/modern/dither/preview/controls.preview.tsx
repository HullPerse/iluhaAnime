import Slider from "@/components/ui/range.component";
import { DITHER_SLIDER_GROUPS, DITHER_SLIDER_LABELS } from "@/config/graphics/dither.config";
import { ditherSliderDef, isSliderActive } from "@/lib/graphics/ditherSlider.utils";
import { useI18n } from "@/hooks/i18n.hook";
import type { DitherEffectOptions } from "@/types/graphics/dither";

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
            const def = ditherSliderDef(field);
            if (!def) return null;
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
