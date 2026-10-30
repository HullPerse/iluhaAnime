import { Checkbox } from "@/components/ui/checkbox.component";

export default function NotifyRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} />
      <span className="text-xs">{label}</span>
    </label>
  );
}
