import { cn } from "cn";

import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { useI18n } from "@/hooks/i18n.hook";
import { THEME_COLOR_KEYS } from "@/config/graphics/themes.config";
import type { ThemeColorKey } from "@/types/graphics/theme";
import type { ThemeDefinition } from "@/types/graphics/theme";

export function ColorGrid({
  colors,
  selected,
  onSelect,
  onPick,
}: {
  colors: ThemeDefinition["colors"];
  selected: ThemeColorKey;
  onSelect: (key: ThemeColorKey) => void;
  onPick: (key: ThemeColorKey, value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {THEME_COLOR_KEYS.map(({ key, label }) => {
        const value = colors[key] ?? colors.muted;
        return (
          <div
            key={key}
            className={cn("flex items-center gap-2 px-1", selected === key && "bg-secondary/30")}
          >
            <button
              type="button"
              aria-label={t(label)}
              aria-pressed={selected === key}
              className={cn(
                "size-3 shrink-0 cursor-pointer",
                selected === key ? "bg-highlight" : "bg-muted"
              )}
              onClick={() => onSelect(key)}
            />
            <span className="windows95-text text-text w-24 shrink-0 truncate">{t(label)}</span>
            <ColorPickerTrigger
              value={value}
              onChange={(v) => {
                onPick(key, v);
                onSelect(key);
              }}
            />
            <span className="text-hint font-mono text-xs">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
