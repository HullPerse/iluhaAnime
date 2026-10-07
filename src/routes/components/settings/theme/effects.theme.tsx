import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import type { Cell } from "@/lib/state/signal.store";
import { patchSettings, settingsAtoms, type SettingsData } from "@/store/settings.store";

export function EffectsCheckbox({
  label,
  field,
  hint,
}: {
  label: string;
  field: keyof SettingsData;
  hint?: string;
}) {
  const value = useCell(settingsAtoms[field] as Cell<boolean>);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">{label}</span>
      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox
          checked={value}
          onChange={(v) => patchSettings({ [field]: v } as unknown as Partial<SettingsData>)}
        />
        <span className="text-xs">{value ? t("common.on") : t("common.off")}</span>
      </label>
      {hint && <span className="text-hint col-start-2 text-[12px]">{hint}</span>}
    </div>
  );
}
