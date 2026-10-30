import { ImageUp, Wand2 } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function PaletteSection({
  fileRef,
  palette,
  paletteFailed,
  onLoad,
  onApply,
  onFile,
  onPick,
}: {
  fileRef: RefObject<HTMLInputElement | null>;
  palette: string[];
  paletteFailed: boolean;
  onLoad: () => void;
  onApply: () => void;
  onFile: (file: File) => void;
  onPick: (color: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="windows95-border flex flex-col gap-1 p-1">
      <div className="flex items-center gap-1">
        <span className="windows95-text flex-1 text-xs font-bold">
          {t("settings.theme.palette")}
        </span>
        <Button className="h-5 px-1 text-xs" onClick={onLoad}>
          <ImageUp className="size-3" />
          {t("settings.theme.palette.load")}
        </Button>
        <Button className="h-5 px-1 text-xs" disabled={palette.length === 0} onClick={onApply}>
          <Wand2 className="size-3" />
          {t("settings.theme.palette.apply")}
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      {palette.length === 0 ? (
        <span className="windows95-text text-hint text-xs">
          {paletteFailed ? t("settings.theme.palette.error") : t("settings.theme.palette.empty")}
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {palette.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              className="windows95-border size-6 cursor-pointer"
              style={{ background: color }}
              onClick={() => onPick(color)}
            />
          ))}
          <span className="windows95-text text-hint text-xs">
            {t("settings.theme.palette.hint")}
          </span>
        </div>
      )}
    </section>
  );
}
