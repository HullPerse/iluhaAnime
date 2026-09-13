import { Pipette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import DitherCanvas from "@/components/shared/dither.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import Slider from "@/components/ui/range.component";
import {
  DITHER_BAKE_MAX_SIDE,
  DITHER_BAKE_TIMEOUT_MS,
  DITHER_DEFAULTS,
  DITHER_PRESETS,
  DITHER_PRESET_LABELS,
  resolveDitherPreset,
} from "@/config/utils/dither.config";
import { useDebounce } from "@/hooks/debounce.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import {
  EXTRACT_PALETTE_MAX_COLORS,
  EXTRACT_PALETTE_MIN_COLORS,
  extractPaletteFromPixels,
} from "@/lib/utils/dither.utils";
import { toUserImage } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { DitherEffectOptions, DitherPresetId } from "@/types/dither";
import type { UserImage, UserImageFile } from "@/types/image.userimage";

import DitherControls from "./controls.preview";
import { PalettePresetStrip } from "./palettePreset.preview";
import { PaletteSwatchStrip } from "./paletteSwatch.preview";

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
  const [extracting, setExtracting] = useState(false);
  const extractFromImage = () => {
    if (extracting) return;
    setExtracting(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const ratio = Math.min(1, 64 / Math.max(1, img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("2d context unavailable");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const palette = extractPaletteFromPixels(
          pixels,
          Math.max(
            EXTRACT_PALETTE_MIN_COLORS,
            Math.min(EXTRACT_PALETTE_MAX_COLORS, options.palette.length)
          )
        );
        if (palette.length === 0) throw new Error("no colors extracted");
        patchOptions({ palette });
      } catch {
        showError(t("common.error"), t("search.dither.palette.extract.error"));
      } finally {
        setExtracting(false);
      }
    };
    img.onerror = () => {
      setExtracting(false);
      showError(t("common.error"), t("search.dither.palette.extract.error"));
    };
    img.src = src;
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
    }, DITHER_BAKE_TIMEOUT_MS);
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
    <Modal
      header={t("search.dither.preview")}
      onClose={onBack}
      onBack={onBack}
      headerActions={
        <button
          type="button"
          onClick={extractFromImage}
          disabled={extracting}
          title={t("search.dither.palette.from.image")}
          aria-label={t("search.dither.palette.from.image")}
          className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px disabled:cursor-default disabled:brightness-90"
        >
          <Pipette className="size-2.5" />
        </button>
      }
      className="w-2xl"
    >
      <DitherCanvas
        src={src}
        className="bg-primary h-56 w-full shrink-0"
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
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="grid grid-cols-3 gap-1">
          {DITHER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              className="h-5 flex-1 px-1 text-xs"
              title={t(DITHER_PRESET_LABELS[preset.id])}
              onClick={() => applyPreset(preset.id)}
              disabled={presetId === preset.id}
            >
              {t(DITHER_PRESET_LABELS[preset.id])}
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
        <PaletteSwatchStrip
          palette={options.palette}
          onChange={(palette) => patchOptions({ palette })}
        />
        <div className="flex flex-row items-stretch gap-1">
          <div className="flex-1">
            <PalettePresetStrip
              active={options.palette}
              onPick={(palette) => patchOptions({ palette })}
            />
          </div>
        </div>
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
        <section className="mt-auto flex w-full flex-row items-center justify-center gap-2">
          <Button
            className="w-[90%]"
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
      </div>
    </Modal>
  );
}
