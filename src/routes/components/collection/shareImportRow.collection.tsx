import { useRemoteImage } from "@/hooks/remoteImage.hook";
import Image from "@/components/ui/image.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import type { ShareImportPlan } from "@/types/core/deeplink";

export function ShareImportRow({
  row,
  index,
  checked,
  importing,
  atCap,
  onToggle,
}: {
  row: ShareImportPlan["rows"][number];
  index: number;
  checked: boolean;
  importing: boolean;
  atCap: boolean;
  onToggle: (index: number) => void;
}) {
  const coverSrc = useRemoteImage(row.snapshot.coverUrl ?? null);
  return (
    <li>
      <label
        className={`windows95-border flex items-center gap-2 p-1 select-none ${
          checked ? "bg-field" : "bg-primary"
        } ${importing ? "opacity-60" : "cursor-pointer"}`}
      >
        <Checkbox
          checked={checked}
          disabled={importing || (!checked && atCap)}
          onChange={() => onToggle(index)}
        />
        {coverSrc ? (
          <Image
            src={coverSrc}
            alt=""
            className="windows95-border h-10 w-8 shrink-0"
            type="cover"
          />
        ) : (
          <div className="bg-surface windows95-border h-10 w-8 shrink-0" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="windows95-text truncate text-xs font-bold">{row.snapshot.title}</span>
          <span className="text-hint windows95-font truncate text-xs">
            {row.snapshot.year ?? ""}
          </span>
        </div>
      </label>
    </li>
  );
}
