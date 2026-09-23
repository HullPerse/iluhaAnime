import { useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input.component";
import { CHANNEL_CONFIG } from "@/config/utils/colors.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { clamp, hslToHsv, hsvToChannelStrings, rgbToHsv } from "@/lib/utils/color.utils";
import type { ChannelFormat, HSV } from "@/types/color";

function toChannels(format: ChannelFormat, values: readonly string[]): HSV | null {
  const numbers = values.map((value) => Math.trunc(Number(value)));
  if (values.some((value) => value === "") || numbers.some(Number.isNaN)) return null;
  const [first = 0, second = 0, third = 0] = numbers;
  if (format === "rgb") {
    return rgbToHsv({ b: clamp(third, 0, 255), g: clamp(second, 0, 255), r: clamp(first, 0, 255) });
  }
  return hslToHsv({ h: clamp(first, 0, 360), l: clamp(third, 0, 100), s: clamp(second, 0, 100) });
}

export function ChannelInputs({
  format,
  hsv,
  onChange,
}: {
  format: ChannelFormat;
  hsv: HSV;
  onChange: (next: HSV) => void;
}) {
  const { t } = useI18n();
  const config = CHANNEL_CONFIG[format];
  const [draft, setDraft] = useState<string[] | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const values = draft ?? hsvToChannelStrings(hsv, format);

  const update = (index: number, raw: string) => {
    const digits = raw.replaceAll(/[^0-9]/gu, "");
    const next = [...values];
    next[index] = digits;
    setDraft(next);
    const parsed = toChannels(format, next);
    if (parsed) onChange(parsed);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Tab") {
      const nextField = refs.current[index + 1];
      if (nextField) {
        event.preventDefault();
        nextField.focus();
      }
      return;
    }
    if (event.key === "Backspace" && values[index] === "" && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex flex-1 flex-row gap-0.5">
      {values.map((value, index) => {
        const name = config.names[index] ?? String(index + 1);
        return (
          <Input
            key={name}
            ref={(element) => {
              refs.current[index] = element;
            }}
            inputMode="numeric"
            aria-label={t("color.channel", { format: format.toUpperCase(), name })}
            value={value}
            onChange={(event) => update(index, event.target.value)}
            onFocus={() => setDraft([...values])}
            onBlur={() => setDraft(null)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className="h-5 min-h-0 min-w-0 px-0.5 text-center text-xs"
          />
        );
      })}
    </div>
  );
}
