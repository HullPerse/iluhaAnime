import { Input } from "@/components/ui/input.component";

export function ExtensionRow({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
      <span className="w-36 shrink-0 font-bold">{label}</span>
      <Input
        className="h-6 flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
    </label>
  );
}
