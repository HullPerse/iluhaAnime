import { Droplets, Eraser, MousePointer2, Pencil, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { ANNOTATION_BRUSH_SIZES, ANNOTATION_TEXT_SIZES } from "@/config/settings/screenshot.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { ScreenshotTool } from "@/types/screenshot";

export const SCREENSHOT_TOOLS: readonly ScreenshotTool[] = [
  "select",
  "pencil",
  "eraser",
  "text",
  "blur",
];

const TOOL_ICONS: Record<ScreenshotTool, LucideIcon> = {
  select: MousePointer2,
  pencil: Pencil,
  eraser: Eraser,
  text: Type,
  blur: Droplets,
};

const TOOL_KEYS: Record<ScreenshotTool, TranslationKey> = {
  select: "screenshot.tool.select",
  pencil: "screenshot.tool.pencil",
  eraser: "screenshot.tool.eraser",
  text: "screenshot.tool.text",
  blur: "screenshot.tool.blur",
};

export function paintsWithColor(tool: ScreenshotTool): boolean {
  return tool === "pencil" || tool === "text";
}

const GROUP = "windows95-active-border bg-field flex flex-row p-0.5";
const OPTION =
  "windows95-text focus-visible:outline-text flex size-6 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted";
const OPTION_ON = "bg-secondary text-title-text";
const OPTION_OFF = "text-text hover:bg-muted";

interface ScreenshotToolbarProps {
  tool: ScreenshotTool;
  color: string;
  brushSize: number;
  textSize: number;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onToolChange: (tool: ScreenshotTool) => void;
  onColorChange: (color: string) => void;
  onBrushSizeChange: (size: number) => void;
  onTextSizeChange: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export default function ScreenshotToolbar({
  tool,
  color,
  brushSize,
  textSize,
  canUndo,
  canRedo,
  canClear,
  onToolChange,
  onColorChange,
  onBrushSizeChange,
  onTextSizeChange,
  onUndo,
  onRedo,
  onClear,
}: ScreenshotToolbarProps) {
  const { t } = useI18n();
  const sizes = tool === "text" ? ANNOTATION_TEXT_SIZES : ANNOTATION_BRUSH_SIZES;
  const activeSize = tool === "text" ? textSize : brushSize;

  return (
    <div className="flex w-full flex-row flex-wrap items-center gap-1">
      <div role="group" aria-label={t("screenshot.tools")} className={GROUP}>
        {SCREENSHOT_TOOLS.map((value) => {
          const Icon = TOOL_ICONS[value];
          return (
            <button
              key={value}
              type="button"
              aria-pressed={tool === value}
              aria-label={t(TOOL_KEYS[value])}
              title={t(TOOL_KEYS[value])}
              className={`${OPTION} ${tool === value ? OPTION_ON : OPTION_OFF}`}
              onClick={() => onToolChange(value)}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
      {paintsWithColor(tool) && (
        <ColorPickerTrigger
          value={color}
          onChange={onColorChange}
          label={t("screenshot.color.custom")}
        />
      )}
      {tool !== "select" && (
        <div
          role="group"
          aria-label={t(tool === "text" ? "screenshot.text.size" : "screenshot.brush")}
          className={GROUP}
        >
          {sizes.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={activeSize === value}
              aria-label={t("screenshot.size.option", { size: value })}
              title={t("screenshot.size.option", { size: value })}
              className={`${OPTION} ${activeSize === value ? OPTION_ON : OPTION_OFF}`}
              onClick={() => (tool === "text" ? onTextSizeChange(value) : onBrushSizeChange(value))}
            >
              {tool === "text" ? (
                <span style={{ fontSize: 8 + value / 5, lineHeight: 1 }}>A</span>
              ) : (
                <span
                  className="bg-text block rounded-full"
                  style={{ height: 2 + value / 1.5, width: 2 + value / 1.5 }}
                />
              )}
            </button>
          ))}
        </div>
      )}
      <div className="ml-auto flex flex-row items-center gap-1">
        <Button
          size="icon"
          aria-label={t("screenshot.undo")}
          title={t("screenshot.undo")}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 />
        </Button>
        <Button
          size="icon"
          aria-label={t("screenshot.redo")}
          title={t("screenshot.redo")}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 />
        </Button>
        <Button
          size="icon"
          aria-label={t("screenshot.clear")}
          title={t("screenshot.clear")}
          disabled={!canClear}
          onClick={onClear}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
