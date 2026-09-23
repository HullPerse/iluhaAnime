import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Check, ClipboardCopy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import ScreenshotStage from "@/components/shared/screenshot/stage.screenshot";
import type { StageHandle } from "@/components/shared/screenshot/stage.screenshot";
import ScreenshotToolbar from "@/components/shared/screenshot/tools.screenshot";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import {
  ANNOTATION_DEFAULT_BRUSH_SIZE,
  ANNOTATION_DEFAULT_COLOR,
  ANNOTATION_DEFAULT_TEXT_SIZE,
  CROP_ZOOM_FIT,
  SCREENSHOT_FORMAT_LABELS,
  SCREENSHOT_FORMATS,
} from "@/config/settings/screenshot.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  undo,
} from "@/lib/settings/annotation.utils";
import { fullCrop, isSquare, NO_PAN } from "@/lib/settings/crop.utils";
import { canSaveScreenshot, defaultScreenshotName } from "@/lib/settings/screenshot.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { resolveFontFamily } from "@/lib/utils/font.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { COPIED_FEEDBACK_MS, showError, showInfo } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AnnotationHistory,
  AnnotationItem,
  CropBounds,
  CropRect,
  ScreenshotCapture,
  ScreenshotFormat,
  ScreenshotScale,
  ScreenshotTool,
} from "@/types/screenshot";

const FIT: ScreenshotScale = { zoom: CROP_ZOOM_FIT, pan: NO_PAN };

const TOOL_HINTS: Record<ScreenshotTool, TranslationKey> = {
  select: "screenshot.hint.select",
  pencil: "screenshot.hint.pencil",
  eraser: "screenshot.hint.eraser",
  text: "screenshot.hint.text",
  blur: "screenshot.hint.blur",
};

export default function ScreenshotModal({
  capture,
  onClose,
}: {
  capture: ScreenshotCapture;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const patchSettings = useSettingsStore((state) => state.patch);
  const savedDir = useSettingsStore((state) => state.screenshotDir);
  const savedFormat = useSettingsStore((state) => state.screenshotFormat);
  const savedOpenFolder = useSettingsStore((state) => state.screenshotOpenFolder);
  const [dir, setDir] = useState(savedDir ?? capture.defaultDir);
  const [name, setName] = useState(defaultScreenshotName());
  const [format, setFormat] = useState<ScreenshotFormat>(savedFormat);
  const [openFolder, setOpenFolder] = useState(savedOpenFolder);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [scale, setScale] = useState<ScreenshotScale>(FIT);
  const [tool, setTool] = useState<ScreenshotTool>("select");
  const [color, setColor] = useState<string>(ANNOTATION_DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(ANNOTATION_DEFAULT_BRUSH_SIZE);
  const [textSize, setTextSize] = useState(ANNOTATION_DEFAULT_TEXT_SIZE);
  const [history, setHistory] = useState<AnnotationHistory>(createHistory);
  const stageRef = useRef<StageHandle>(null);
  const copyTimer = useRef(0);
  const family = useMemo(() => resolveFontFamily(), []);
  const bounds = useMemo<CropBounds>(
    () => ({ width: capture.width, height: capture.height }),
    [capture.width, capture.height]
  );
  const selection = crop;
  const active = crop ?? fullCrop(bounds);
  const fitted = scale.zoom === FIT.zoom && scale.pan.x === 0 && scale.pan.y === 0;
  const canSave = canSaveScreenshot(name, dir) && !saving;
  const items = history.present;
  const canClearAnnotations = items.length > 0;
  const formatOptions = useMemo(
    () =>
      SCREENSHOT_FORMATS.map((value) => ({
        value,
        label: t(SCREENSHOT_FORMAT_LABELS[value]),
      })),
    [t]
  );

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      setHistory(event.shiftKey && key === "z" ? redo : key === "y" ? redo : undo);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const commitItems = useCallback((next: AnnotationItem[]) => {
    setHistory((previous) => commit(previous, next));
  }, []);

  const browse = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: dir || undefined,
      title: t("picker.select.folder"),
    });
    if (typeof picked === "string") setDir(picked);
  };

  const copy = async () => {
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    const [path, prepareError] = await attempt(
      systemApi.copyScreenshot(capture.path, selection, stageRef.current?.layers() ?? undefined)
    );
    if (prepareError) {
      setCopied(false);
      showError(t("common.error"), t("screenshot.copy.error"));
      return;
    }
    const [, writeError] = await attempt(writeImage(path));
    if (path !== capture.path) {
      attempt(systemApi.discardScreenshot(path)).then(([, error]) => {
        if (error) reportBackgroundError("screenshot.discard-copy", error);
      });
    }
    if (writeError) {
      setCopied(false);
      showError(t("common.error"), t("screenshot.copy.error"));
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const [saved, error] = await attempt(
      systemApi.saveScreenshot({
        sourcePath: capture.path,
        dir,
        name: name.trim(),
        format,
        crop: selection,
        layers: stageRef.current?.layers() ?? undefined,
      })
    );
    setSaving(false);
    if (error) {
      showError(t("common.error"), t("screenshot.save.error"));
      return;
    }
    patchSettings({
      screenshotDir: dir,
      screenshotFormat: format,
      screenshotOpenFolder: openFolder,
    });
    onClose();
    showInfo(t("screenshot.title"), saved.path);
    if (!openFolder) return;
    const [, openError] = await attempt(openPath(dir));
    if (openError) reportBackgroundError("screenshot.open-folder", openError);
  };

  return (
    <Modal
      header={t("screenshot.title")}
      onClose={onClose}
      className="w-4xl"
      contentClassName="gap-2"
    >
      <ScreenshotStage
        src={assetUrl(capture.path)}
        alt={t("screenshot.title")}
        label={t("screenshot.crop.aria", {
          width: active.width,
          height: active.height,
          x: active.x,
          y: active.y,
        })}
        family={family}
        bounds={bounds}
        crop={crop}
        scale={scale}
        tool={tool}
        color={color}
        size={tool === "text" ? textSize : brushSize}
        items={items}
        handleRef={stageRef}
        onCropChange={setCrop}
        onScaleChange={setScale}
        onCommit={commitItems}
      />
      <ScreenshotToolbar
        tool={tool}
        color={color}
        brushSize={brushSize}
        textSize={textSize}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        canClear={canClearAnnotations}
        onToolChange={setTool}
        onColorChange={setColor}
        onBrushSizeChange={setBrushSize}
        onTextSizeChange={setTextSize}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        onClear={() => setHistory((previous) => commit(previous, []))}
      />
      <div className="flex w-full flex-row flex-wrap items-center gap-2">
        <span className="windows95-text text-xs tabular-nums">
          {t("screenshot.size", { width: active.width, height: active.height })}
        </span>
        {selection !== null && isSquare(active) && (
          <span className="windows95-active-border bg-primary windows95-text px-1 text-xs">
            {t("screenshot.crop.square")}
          </span>
        )}
        <span className="windows95-text text-hint text-xs">
          {tool === "select" && selection === null
            ? t("screenshot.crop.empty")
            : t(TOOL_HINTS[tool])}
        </span>
        <Button
          className="ml-auto"
          onClick={() => setScale(FIT)}
          disabled={fitted}
          title={t("screenshot.crop.zoom")}
        >
          {Math.round(scale.zoom * 100)}%
        </Button>
        <Button
          onClick={() => setCrop(null)}
          disabled={selection === null}
          title={t("screenshot.crop.reset")}
        >
          {t("screenshot.crop.reset")}
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="windows95-text text-xs">{t("screenshot.folder")}</span>
        <div className="flex flex-row gap-1">
          <Input value={dir} readOnly title={dir} aria-label={t("screenshot.folder")} />
          <Button onClick={() => browse()} className="shrink-0">
            {t("picker.browse")}
          </Button>
        </div>
      </div>
      <div className="flex flex-row gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="windows95-text text-xs">{t("screenshot.name")}</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={t("screenshot.name")}
          />
        </div>
        <div className="flex w-40 shrink-0 flex-col gap-1">
          <span className="windows95-text text-xs">{t("screenshot.format")}</span>
          <Select
            value={format}
            onChange={(value) => setFormat(value === "jpeg" ? "jpeg" : "png")}
            options={formatOptions}
            label={t("screenshot.format")}
          />
        </div>
      </div>
      <div className="flex flex-row items-center gap-1">
        <Checkbox
          checked={openFolder}
          onChange={setOpenFolder}
          aria-label={t("screenshot.open.folder")}
        />
        <span className="windows95-text text-xs">{t("screenshot.open.folder")}</span>
      </div>
      <section className="mt-auto flex w-full flex-row items-center justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => copy()}
          disabled={copied}
          title={t("screenshot.copy")}
        >
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? t("screenshot.copy.done") : t("screenshot.copy")}
        </Button>
        <Button variant="success" onClick={() => save()} disabled={!canSave}>
          {saving ? <SmallLoader /> : t("screenshot.save")}
        </Button>
      </section>
    </Modal>
  );
}
