import { Input } from "@/components/ui/input.component";

export function NetworkNumberRow({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="group windows95-text text-text flex items-center gap-2 select-none">
        <span className="w-48 shrink-0">{label}</span>
        <Input
          className="h-6 w-24"
          value={value}
          aria-invalid={error !== undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {error !== undefined && (
        <span className="text-destructive pl-2 text-xs" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
