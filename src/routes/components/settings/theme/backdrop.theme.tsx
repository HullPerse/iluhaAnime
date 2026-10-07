import Slider from "@/components/ui/range.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

export function BackdropSlider() {
  const value = useCell(settingsAtoms.modalBackdropOpacity);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">
        {t("settings.theme.backdrop")}
      </span>
      <Slider
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(v) => patchSettings({ modalBackdropOpacity: v })}
        suffix="%"
      />
    </div>
  );
}
