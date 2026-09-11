import Slider from "@/components/ui/range.component";
import { DITHER_SLIDER_DEFS } from "@/config/utils/dither.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { DitherEffectOptions, DitherSliderField } from "@/types/dither";
import type { TranslationKey } from "@/types/i18n";

const SLIDER_LABELS: Record<DitherSliderField, TranslationKey> = {
  levels: "search.dither.opt.levels",
  ditherStrength: "search.dither.opt.ditherStrength",
  ditherAmount: "search.dither.opt.ditherAmount",
  grain: "search.dither.opt.grain",
  texture: "search.dither.opt.texture",
  halftone: "search.dither.opt.halftone",
  halftoneSize: "search.dither.opt.halftoneSize",
  halftoneSoftness: "search.dither.opt.halftoneSoftness",
  monochromeNoise: "search.dither.opt.monochromeNoise",
  ink: "search.dither.opt.ink",
  edgeDistortion: "search.dither.opt.edgeDistortion",
  misregistration: "search.dither.opt.misregistration",
  paper: "search.dither.opt.paper",
  vignette: "search.dither.opt.vignette",
  paletteBias: "search.dither.opt.paletteBias",
  shadowCrush: "search.dither.opt.shadowCrush",
  highlightCompression: "search.dither.opt.highlightCompression",
  contrastCurve: "search.dither.opt.contrastCurve",
  blackPoint: "search.dither.opt.blackPoint",
  localContrast: "search.dither.opt.localContrast",
  inkDensity: "search.dither.opt.inkDensity",
};

export default function DitherControls({
  options,
  onPatch,
}: {
  options: DitherEffectOptions;
  onPatch: (partial: Partial<DitherEffectOptions>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto p-1">
      {DITHER_SLIDER_DEFS.map(({ field, min, max, step }) => (
        <Slider
          key={field}
          label={t(SLIDER_LABELS[field])}
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
