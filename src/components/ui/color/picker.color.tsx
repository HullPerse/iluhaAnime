import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { COLOR_FORMATS } from "@/config/utils/colors.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatColor, hexToHsv, hsvToHex, parseColor } from "@/lib/utils/color.utils";
import type { ColorFormat, HSV } from "@/types/color";

import { SaturationValueArea } from "./area.color";
import { ChannelInputs } from "./channels.color";
import { HueSlider } from "./hue.color";

const FALLBACK_HSV: HSV = { h: 0, s: 0, v: 50 };

export function ColorPicker({
  value,
  onConfirm,
  onCancel,
}: {
  value: string;
  onConfirm: (hex: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value) ?? FALLBACK_HSV);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [inputText, setInputText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    const next = hexToHsv(value);
    if (next) setHsv(next);
  }

  const hex = hsvToHex(hsv);
  const isChannelFormat = format === "rgb" || format === "hsl";
  const displayText = editing ? inputText : formatColor(hsv, format);
  const invalid = editing && parseColor(inputText, format) === null;

  const handleTextChange = (text: string) => {
    setEditing(true);
    setInputText(text);
    const parsed = parseColor(text, format);
    if (parsed) setHsv(parsed);
  };

  return (
    <div className="windows95-active-border bg-primary flex w-60 flex-col gap-1.5 p-2">
      <SaturationValueArea
        hsv={hsv}
        onChange={({ s, v }) => setHsv((current) => ({ ...current, s, v }))}
      />

      <div className="flex flex-row items-center gap-2">
        <div aria-hidden className="windows95-border size-5 shrink-0" style={{ background: hex }} />
        <HueSlider hue={hsv.h} onChange={(h) => setHsv((current) => ({ ...current, h }))} />
      </div>

      <div className="flex flex-row items-stretch gap-1">
        <div className="windows95-active-border flex shrink-0 flex-row">
          {COLOR_FORMATS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={format === option}
              className={
                format === option
                  ? "windows95-text bg-secondary text-title-text focus-visible:outline-text px-1 text-xs font-bold focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
                  : "windows95-text bg-field text-text hover:bg-muted focus-visible:outline-text px-1 text-xs focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
              }
              onClick={() => {
                setFormat(option);
                setEditing(false);
              }}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>

        {isChannelFormat ? (
          <ChannelInputs key={format} format={format} hsv={hsv} onChange={setHsv} />
        ) : (
          <Input
            aria-label={t("color.value")}
            aria-invalid={invalid}
            value={displayText.replace("#", "")}
            placeholder="000000"
            spellCheck={false}
            className="h-5 min-h-0 min-w-0 flex-1 px-1 text-xs uppercase"
            onChange={(event) => handleTextChange(`#${event.target.value}`)}
            onFocus={() => {
              setEditing(true);
              setInputText(formatColor(hsv, format));
            }}
            onBlur={() => setEditing(false)}
          />
        )}
      </div>

      <div className="flex flex-row justify-end gap-1">
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={() => onConfirm(hex)}>{t("common.ok")}</Button>
      </div>
    </div>
  );
}
