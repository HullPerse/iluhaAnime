import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import DitherCanvas from "@/components/shared/dither.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import Slider from "@/components/ui/range.component";
import {
  DITHER_DEFAULTS,
  DITHER_BAKE_MAX_SIDE,
  DITHER_PRESETS,
  resolveDitherPreset,
  type DitherPresetId,
} from "@/config/utils/dither.config";
import { useDebounce } from "@/hooks/debounce.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { hexToRgba } from "@/lib/utils/color.utils";
import { toUserImage } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { UserImage, UserImageFile } from "@/types";
import type { DitherEffectOptions, DitherRGB } from "@/types/dither";

import DitherControls from "./controls.preview";

function rgbToHex([r, g, b]: DitherRGB): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToSwatch(palette: DitherRGB[]): string | null {
  const last = palette.at(-1);
  return last ? rgbToHex(last) : null;
}

function PalettePicker({
  palette,
  onChange,
}: {
  palette: DitherRGB[];
  onChange: (palette: DitherRGB[]) => void;
}) {
  const [custom, setCustom] = useState<string | null>(null);

  const patch = (index: number, hex: string) => {
    const rgba = hexToRgba(hex);
    if (!rgba) return;
    const next = [...palette];
    next[index] = [rgba.r, rgba.g, rgba.b];
    onChange(next);
    setCustom(hexToSwatch(next));
  };

  return (
    <div className="flex flex-col gap-1">
      {palette.map(([r, g, b], index) => {
        const hex = rgbToHex([r, g, b]);
        return (
          <div key={`${index}-${hex}`} className="flex items-center gap-1">
            <ColorPickerTrigger value={hex} onChange={(value) => patch(index, value)} />
            <span className="windows95-text flex-1 truncate text-xs">
              #{hex.replace("#", "").toUpperCase()}
            </span>
            <Button
              size="icon"
              className="h-4 w-4"
              title="x"
              disabled={palette.length <= 2}
              onClick={() => onChange(palette.filter((_, i) => i !== index))}
            >
              <X className="size-2.5" />
            </Button>
          </div>
        );
      })}
      {custom && (
        <Button
          className="h-5 px-1 text-xs"
          title="+"
          onClick={() => {
            const rgba = hexToRgba(custom);
            if (!rgba) return;
            onChange([...palette, [rgba.r, rgba.g, rgba.b]]);
          }}
        >
          +
        </Button>
      )}
    </div>
  );
}

const PRESET_LABELS: Record<
  DitherPresetId,
  | "search.dither.preset.empty"
  | "search.dither.preset.default"
  | "search.dither.preset.deep"
  | "search.dither.preset.soft"
  | "search.dither.preset.natural"
  | "search.dither.preset.capy"
> = {
  empty: "search.dither.preset.empty",
  default: "search.dither.preset.default",
  deep: "search.dither.preset.deep",
  soft: "search.dither.preset.soft",
  natural: "search.dither.preset.natural",
  capy: "search.dither.preset.capy",
};

const BAKE_TIMEOUT_MS = 30000;

export default function DitherPreviewModal({
  image,
  onBack,
  onSaved,
}: {
  image: UserImage;
  onBack: () => void;
  onSaved: (image: UserImage) => void;
}) {
  const { t } = useI18n();
  const [presetId, setPresetId] = useState<DitherPresetId>("empty");
  const [options, setOptions] = useState<DitherEffectOptions>(() => resolveDitherPreset("empty"));
  const [scale, setScale] = useState(DITHER_DEFAULTS.scale);
  const renderScale = useDebounce(scale, 200);
  const renderOptions = useDebounce(options, 200);
  const renderStale = renderOptions !== options || renderScale !== scale;
  const bakeRef = useRef<HTMLCanvasElement | null>(null);
  const bakeStartedRef = useRef(false);
  const bakeStageRef = useRef<"frame" | "database">("frame");
  const [canSave, setCanSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baking, setBaking] = useState(false);
  const [bakeProgress, setBakeProgress] = useState<{ done: number; total: number } | null>(null);
  const bakeTimerRef = useRef(0);
  const src = image.originalUrl ?? image.url;

  const applyPreset = (id: DitherPresetId) => {
    setPresetId(id);
    setOptions(resolveDitherPreset(id));
    setCanSave(false);
  };

  const patchOptions = (partial: Partial<DitherEffectOptions>) => {
    setOptions((prev) => ({ ...prev, ...partial }));
    setCanSave(false);
  };

  const stopBaking = () => {
    window.clearTimeout(bakeTimerRef.current);
    bakeStartedRef.current = false;
    setSaving(false);
    setBaking(false);
    setBakeProgress(null);
  };

  useEffect(() => () => window.clearTimeout(bakeTimerRef.current), []);

  const save = () => {
    if (!canSave || saving || renderStale) return;
    setSaving(true);
    setBaking(true);
    setBakeProgress(null);
    bakeStageRef.current = "frame";
    window.clearTimeout(bakeTimerRef.current);
    bakeTimerRef.current = window.setTimeout(() => {
      const stage = bakeStageRef.current;
      stopBaking();
      showError(
        t("common.error"),
        t(
          stage === "frame"
            ? "search.dither.bake.timeout.frame"
            : "search.dither.bake.timeout.database"
        )
      );
    }, BAKE_TIMEOUT_MS);
  };

  const bakeFullFrame = async () => {
    if (bakeStartedRef.current) return;
    bakeStartedRef.current = true;
    bakeStageRef.current = "database";
    const canvas = bakeRef.current;
    if (!canvas) {
      stopBaking();
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      stopBaking();
      showError(t("common.error"), t("search.dither.save.error"));
      return;
    }
    const [updated, error] = await attempt(
      invokeTyped<UserImageFile>("update_dither_image_data", {
        id: image.id,
        dataUrl,
      })
    );
    window.clearTimeout(bakeTimerRef.current);
    bakeStartedRef.current = false;
    setSaving(false);
    setBaking(false);
    setBakeProgress(null);
    if (error) return showError(t("common.error"), t("search.dither.save.error"));
    onSaved(toUserImage(updated));
    onBack();
  };

  return (
    <Modal header={t("search.dither.preview")} onClose={onBack} onBack={onBack} className="w-2xl">
      <DitherCanvas
        src={src}
        className="aspect-video w-full"
        capToDisplay
        scale={renderScale}
        {...renderOptions}
        onReady={() => setCanSave(true)}
        onError={(message) => showError(t("common.error"), message)}
      />
      {baking && (
        <DitherCanvas
          ref={bakeRef}
          src={src}
          className="hidden"
          maxLongSide={DITHER_BAKE_MAX_SIDE}
          scale={renderScale}
          {...renderOptions}
          onReady={() => bakeFullFrame()}
          onProgress={(done, total) => setBakeProgress({ done, total })}
          onError={(message) => {
            stopBaking();
            showError(t("common.error"), message);
          }}
        />
      )}
      <div className="flex flex-row gap-1">
        {DITHER_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            className="h-5 flex-1 px-1 text-xs"
            title={t(PRESET_LABELS[preset.id])}
            onClick={() => applyPreset(preset.id)}
            disabled={presetId === preset.id}
          >
            {t(PRESET_LABELS[preset.id])}
          </Button>
        ))}
      </div>
      <div className="flex flex-row gap-1">
        <Button
          className="h-5 flex-1 px-1 text-xs"
          title="Bayer 4"
          onClick={() => patchOptions({ ditherMatrix: "bayer4" })}
          disabled={options.ditherMatrix === "bayer4"}
        >
          Bayer 4
        </Button>
        <Button
          className="h-5 flex-1 px-1 text-xs"
          title="Blue 64"
          onClick={() => patchOptions({ ditherMatrix: "blue64" })}
          disabled={options.ditherMatrix === "blue64"}
        >
          Blue 64
        </Button>
      </div>
      <div className="flex flex-row gap-1">
        <Button
          className="h-5 flex-1 px-1 text-xs"
          title={t("search.dither.grain.gray")}
          onClick={() => patchOptions({ grayGrain: true })}
          disabled={options.grayGrain}
        >
          {t("search.dither.grain.gray")}
        </Button>
        <Button
          className="h-5 flex-1 px-1 text-xs"
          title={t("search.dither.grain.color")}
          onClick={() => patchOptions({ grayGrain: false })}
          disabled={!options.grayGrain}
        >
          {t("search.dither.grain.color")}
        </Button>
      </div>
      <PalettePicker palette={options.palette} onChange={(palette) => patchOptions({ palette })} />
      <Slider
        label={t("search.dither.opt.scale")}
        min={0.1}
        max={1}
        step={0.05}
        value={scale}
        onChange={(value) => {
          setScale(value);
          setCanSave(false);
        }}
      />
      <DitherControls options={options} onPatch={patchOptions} />
      <section className="mt-auto flex w-full flex-row gap-2">
        <Button
          className="flex-1"
          variant="success"
          onClick={() => save()}
          disabled={!canSave || saving || renderStale}
        >
          {saving ? (
            bakeProgress && bakeProgress.total > 0 ? (
              <span className="flex w-full items-center gap-2">
                <ProgressBar
                  value={bakeProgress.done}
                  max={bakeProgress.total}
                  className="h-4 flex-1"
                />
                <span className="tabular-nums">
                  {Math.round((bakeProgress.done / bakeProgress.total) * 100)}%
                </span>
              </span>
            ) : (
              <SmallLoader />
            )
          ) : (
            t("search.dither.save")
          )}
        </Button>
      </section>
    </Modal>
  );
}
