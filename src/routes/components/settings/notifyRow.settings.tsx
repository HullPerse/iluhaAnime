import { Checkbox } from "@/components/ui/checkbox.component";
import type { SettingsData } from "@/types/store/settings";

import { SettingResetButton } from "@/routes/components/settings/resetSetting.settings";

export default function NotifyRow({
  label,
  checked,
  disabled,
  field,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  field?: keyof SettingsData;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="group flex items-center gap-1">
      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox checked={checked} disabled={disabled} onChange={onChange} />
        <span className="text-xs">{label}</span>
      </label>
      {field !== undefined && <SettingResetButton field={field} label={label} />}
    </div>
  );
}
