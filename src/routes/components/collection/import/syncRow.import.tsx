import { Checkbox } from "@/components/ui/checkbox.component";
import type { AniListEntry } from "@/types/anilist";

export function SyncRow({
  entry,
  checked,
  changeText,
  onToggle,
}: {
  entry: AniListEntry;
  checked: boolean;
  changeText: string;
  onToggle: (id: number) => void;
}) {
  const title = entry.media.title;
  return (
    <label
      className={`windows95-border flex cursor-pointer items-center gap-2 p-1 select-none ${checked ? "bg-white" : "bg-primary"}`}
    >
      <Checkbox checked={checked} onChange={() => onToggle(entry.media.id)} />
      <div className="flex min-w-0 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={title}>
          {title}
        </span>
        <span className="text-hint truncate text-xs" title={changeText}>
          {changeText}
        </span>
      </div>
    </label>
  );
}
