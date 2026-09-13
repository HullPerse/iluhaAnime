import { Input } from "@/components/ui/input.component";

export function NetworkNumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="windows95-text text-text flex items-center gap-2 select-none">
      <span className="w-48 shrink-0">{label}</span>
      <Input className="h-6 w-24" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
