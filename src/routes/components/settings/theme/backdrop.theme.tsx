import Slider from "@/components/ui/range.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";

export function BackdropSlider() {
  const value = useSettingsStore((s) => s.modalBackdropOpacity);
  const patch = useSettingsStore((s) => s.patch);
  const { t: tr } = useI18n();
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">
        {tr("settings.theme.backdrop")}
      </span>
      <Slider
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(v) => patch({ modalBackdropOpacity: v })}
        suffix="%"
      />
    </div>
  );
}
