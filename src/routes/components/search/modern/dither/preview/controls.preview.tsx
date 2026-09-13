import Slider from "@/components/ui/range.component";
import { DITHER_SLIDER_DEFS, DITHER_SLIDER_LABELS } from "@/config/utils/dither.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { DitherEffectOptions } from "@/types/dither";

export default function DitherControls({
  options,
  onPatch,
}: {
  options: DitherEffectOptions;
  onPatch: (partial: Partial<DitherEffectOptions>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      {DITHER_SLIDER_DEFS.map(({ field, min, max, step }) => (
        <Slider
          key={field}
          label={t(DITHER_SLIDER_LABELS[field])}
          min={min}
          max={max}
          step={step}
          value={options[field]}
          onChange={(value) => onPatch({ [field]: value })}
        />
      ))}
    </div>
  );
}
