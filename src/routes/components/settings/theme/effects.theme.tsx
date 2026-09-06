import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { SettingsStore } from "@/types/settings";

export function EffectsCheckbox({ label, field }: { label: string; field: keyof SettingsStore }) {
  const value = useSettingsStore((s) => s[field] as boolean);
  const patch = useSettingsStore((s) => s.patch);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">{label}</span>
      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox checked={value} onChange={(v) => patch({ [field]: v })} />
        <span className="text-xs">{value ? t("common.on") : t("common.off")}</span>
      </label>
    </div>
  );
}
